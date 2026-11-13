import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';
import { validateCoordinates, validateRoundId } from '../validators.js';
import { getIssPositionAtTimestamp } from '../lib/issApi.js';
import {
  calculateHaversineDistanceKm,
  calculateRoundScore,
  calculateLevelAndProgress,
  computeBadges,
  determineNewBadges,
} from '../domain/gameLogic.js';

const router = Router();

const ROUND_EXPIRY_MS = 5 * 60 * 1000; // 5 menit
const TARGET_OFFSET_SECONDS = 600; // 10 menit ke depan

/**
 * POST /api/rounds
 * Memulai ronde baru atau mengembalikan ronde terbuka yang masih valid (< 5 menit).
 * Menolak pembuatan ronde baru jika masih ada ronde terbuka.
 * Mencegah race condition melalui unique index parsial Postgres (23505).
 */
export async function createRoundHandler(req, res, next) {
  try {
    const supabase = getSupabaseAdmin();

    // Pastikan pemain sudah memiliki baris profil
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', req.playerId)
      .maybeSingle();

    if (profileErr) throw profileErr;
    if (!profile) {
      throw AppError.notFound('Profil belum dibuat.', 'PROFILE_REQUIRED');
    }

    // Periksa apakah pemain memiliki ronde berstatus 'open'
    const { data: openRounds, error: fetchErr } = await supabase
      .from('rounds')
      .select('id, target_ts, created_at, status')
      .eq('player_id', req.playerId)
      .eq('status', 'open');

    if (fetchErr) throw fetchErr;

    if (openRounds && openRounds.length > 0) {
      const activeRound = openRounds[0];
      const ageMs = Date.now() - new Date(activeRound.created_at).getTime();

      if (ageMs > ROUND_EXPIRY_MS) {
        // Tandai sebagai expired jika sudah lewat 5 menit
        await supabase
          .from('rounds')
          .update({ status: 'expired' })
          .eq('id', activeRound.id)
          .eq('player_id', req.playerId);
      } else {
        // Ronde terbuka masih valid, kembalikan ronde yang sama
        return res.json({
          ok: true,
          data: {
            roundId: activeRound.id,
            targetTs: activeRound.target_ts,
            startedAt: activeRound.created_at,
          },
        });
      }
    }

    // Buat ronde baru dengan target 10 menit ke depan
    const nowSec = Math.floor(Date.now() / 1000);
    const targetTs = nowSec + TARGET_OFFSET_SECONDS;

    const { data: inserted, error: insertErr } = await supabase
      .from('rounds')
      .insert({
        player_id: req.playerId,
        target_ts: targetTs,
        status: 'open',
      })
      .select('id, target_ts, created_at')
      .single();

    if (insertErr) {
      // Jika terjadi tabrakan kueri bersamaan (race condition), tangkap 23505
      if (insertErr.code === '23505' || insertErr.message?.includes('rounds_one_open_per_player')) {
        const { data: reloaded, error: reloadErr } = await supabase
          .from('rounds')
          .select('id, target_ts, created_at')
          .eq('player_id', req.playerId)
          .eq('status', 'open')
          .single();

        if (reloadErr || !reloaded) {
          throw insertErr;
        }

        return res.json({
          ok: true,
          data: {
            roundId: reloaded.id,
            targetTs: reloaded.target_ts,
            startedAt: reloaded.created_at,
          },
        });
      }
      throw insertErr;
    }

    return res.status(201).json({
      ok: true,
      data: {
        roundId: inserted.id,
        targetTs: inserted.target_ts,
        startedAt: inserted.created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/rounds/:id/guess
 * Mengunci tebakan pemain untuk ronde yang sedang berjalan:
 * 1. Cek kepemilikan ronde (404 jika bukan milik pemain atau tidak ada)
 * 2. Cek status (409 jika sudah berstatus done/expired)
 * 3. Cek batas waktu 5 menit (410 GONE, tandai expired jika lewat)
 * 4. Ambil posisi ISS pada waktu target dari API (502 jika gagal, ronde tetap open)
 * 5. Hitung jarak (Haversine) dan skor ronde
 * 6. Update bersyarat (where id and player_id and status='open', 409 jika 0 baris)
 * 7. Hitung total skor, level, progres, dan lencana baru
 */
export async function submitGuessHandler(req, res, next) {
  try {
    const roundId = validateRoundId(req.params?.id);
    const { lat, lng } = validateCoordinates(req.body?.lat, req.body?.lng);
    const supabase = getSupabaseAdmin();

    // 1. Cek token dan kepemilikan ronde
    const { data: round, error: roundErr } = await supabase
      .from('rounds')
      .select('id, player_id, status, target_ts, created_at')
      .eq('id', roundId)
      .eq('player_id', req.playerId)
      .maybeSingle();

    if (roundErr) throw roundErr;
    if (!round) {
      throw AppError.notFound('Ronde tidak ditemukan atau bukan milikmu.', 'ROUND_NOT_FOUND');
    }

    // 2. Cek status ronde
    if (round.status !== 'open') {
      throw AppError.conflict('Ronde sudah pernah dikunci.', 'ROUND_ALREADY_FINISHED');
    }

    // 3. Cek batas kedaluwarsa 5 menit
    const ageMs = Date.now() - new Date(round.created_at).getTime();
    if (ageMs > ROUND_EXPIRY_MS) {
      await supabase
        .from('rounds')
        .update({ status: 'expired' })
        .eq('id', round.id)
        .eq('player_id', req.playerId);

      throw AppError.gone('Ronde sudah kedaluwarsa. Mulai ronde baru.', 'ROUND_EXPIRED');
    }

    // Ambil statistik pemain sebelum ronde ini di-update
    const { data: prevStatsData } = await supabase
      .from('player_stats')
      .select('total_score, rounds_done, best_distance_km')
      .eq('player_id', req.playerId)
      .maybeSingle();

    const prevTotalScore = Number(prevStatsData?.total_score || 0);
    const prevRoundsDone = Number(prevStatsData?.rounds_done || 0);
    const prevBestDist =
      prevStatsData?.best_distance_km !== null && prevStatsData?.best_distance_km !== undefined
        ? Number(prevStatsData.best_distance_km)
        : null;

    const badgesBefore = computeBadges(prevRoundsDone, prevBestDist);

    // 4. Ambil jawaban dari API ISS (jika gagal lempar 502, ronde tetap open)
    const issTarget = await getIssPositionAtTimestamp(round.target_ts);
    const answer = {
      lat: Number(issTarget.latitude.toFixed(4)),
      lng: Number(issTarget.longitude.toFixed(4)),
    };

    // 5. Hitung jarak dan skor
    const distanceKm = Number(
      calculateHaversineDistanceKm(lat, lng, answer.lat, answer.lng).toFixed(2),
    );
    const roundScore = calculateRoundScore(distanceKm);

    // 6. Update bersyarat di database
    const { data: updatedRows, error: updateErr } = await supabase
      .from('rounds')
      .update({
        status: 'done',
        guess_lat: lat,
        guess_lng: lng,
        answer_lat: answer.lat,
        answer_lng: answer.lng,
        distance_km: distanceKm,
        score: roundScore,
        finished_at: new Date().toISOString(),
      })
      .eq('id', round.id)
      .eq('player_id', req.playerId)
      .eq('status', 'open')
      .select('id, status');

    if (updateErr) throw updateErr;
    if (!updatedRows || updatedRows.length === 0) {
      throw AppError.conflict('Ronde sudah pernah dikunci.', 'ROUND_ALREADY_FINISHED');
    }

    // 7. Hitung total, level, dan lencana baru
    const newTotalScore = prevTotalScore + roundScore;
    const newRoundsDone = prevRoundsDone + 1;
    const newBestDist = prevBestDist === null ? distanceKm : Math.min(prevBestDist, distanceKm);

    const badgesAfter = computeBadges(newRoundsDone, newBestDist);
    const newBadges = determineNewBadges(badgesBefore, badgesAfter);
    const { level, progress } = calculateLevelAndProgress(newTotalScore);

    return res.json({
      ok: true,
      data: {
        answer,
        distanceKm,
        score: roundScore,
        totalScore: newTotalScore,
        level,
        progress,
        newBadges,
      },
    });
  } catch (err) {
    return next(err);
  }
}

router.post('/', requireAuth, createRoundHandler);
router.post('/:id/guess', requireAuth, submitGuessHandler);

export default router;
