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
  EDUCATIONAL_FACTS,
} from '../domain/gameLogic.js';

const router = Router();

// Horizon & difficulty dikunci — sesuai simplifikasi UI
const FIXED_HORIZON = 600; // 10 menit
const FIXED_DIFFICULTY = 'normal';
const ROUND_EXPIRY_MS = 5 * 60 * 1000; // 5 menit
const COOLDOWN_SECONDS = 10; // Cooldown 10 detik antar ronde

/**
 * POST /api/rounds
 * Memulai ronde baru atau mengembalikan ronde terbuka yang masih valid (< 5 menit).
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
    // Kolom horizon_seconds & difficulty mungkin belum ada di DB lama — tidak di-select
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
            horizonSeconds: FIXED_HORIZON,
            difficulty: FIXED_DIFFICULTY,
          },
        });
      }
    }

    // Cooldown 10 detik antar ronde selesai
    const { data: lastFinished } = await supabase
      .from('rounds')
      .select('finished_at')
      .eq('player_id', req.playerId)
      .eq('status', 'done')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastFinished?.finished_at) {
      const elapsedSec = (Date.now() - new Date(lastFinished.finished_at).getTime()) / 1000;
      if (elapsedSec < COOLDOWN_SECONDS) {
        const remainingSec = Math.ceil(COOLDOWN_SECONDS - elapsedSec);
        throw AppError.tooManyRequests(
          `Tunggu ${remainingSec} detik sebelum memulai ronde baru.`,
          'ROUND_COOLDOWN',
        );
      }
    }

    // Buat ronde baru — tanpa kolom horizon_seconds/difficulty yang mungkin belum ada di DB
    const nowSec = Math.floor(Date.now() / 1000);
    const targetTs = nowSec + FIXED_HORIZON;

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
      // Jika terjadi race condition (unique index), ambil ronde yang sudah dibuat
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
            horizonSeconds: FIXED_HORIZON,
            difficulty: FIXED_DIFFICULTY,
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
        horizonSeconds: FIXED_HORIZON,
        difficulty: FIXED_DIFFICULTY,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/rounds/:id/guess
 * Mengunci tebakan pemain untuk ronde yang sedang berjalan.
 */
export async function submitGuessHandler(req, res, next) {
  try {
    const roundId = validateRoundId(req.params?.id);
    const { lat, lng } = validateCoordinates(req.body?.lat, req.body?.lng);
    const supabase = getSupabaseAdmin();

    // 1. Cek kepemilikan ronde — tanpa kolom opsional
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
    // Hanya ambil kolom yang pasti ada di semua skema DB
    const { data: prevStatsData } = await supabase
      .from('player_stats')
      .select('total_score, rounds_done, best_distance_km')
      .eq('player_id', req.playerId)
      .maybeSingle();

    const badgesBefore = computeBadges(prevStatsData || {});

    // 4. Ambil jawaban dari ISS propagator
    const issTarget = await getIssPositionAtTimestamp(round.target_ts);
    const answer = {
      lat: Number(issTarget.latitude.toFixed(4)),
      lng: Number(issTarget.longitude.toFixed(4)),
    };

    // 5. Hitung jarak dan skor
    const distanceKm = Number(
      calculateHaversineDistanceKm(lat, lng, answer.lat, answer.lng).toFixed(2),
    );
    const roundScore = calculateRoundScore(distanceKm, FIXED_DIFFICULTY);

    // 6. Update ronde di database
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
    const prevTotalScore = Number(prevStatsData?.total_score || 0);
    const prevRoundsDone = Number(prevStatsData?.rounds_done || 0);
    const prevBestDist =
      prevStatsData?.best_distance_km !== null && prevStatsData?.best_distance_km !== undefined
        ? Number(prevStatsData.best_distance_km)
        : null;

    const newTotalScore = prevTotalScore + roundScore;
    const newRoundsDone = prevRoundsDone + 1;
    const newBestDist = prevBestDist === null ? distanceKm : Math.min(prevBestDist, distanceKm);

    const badgesAfter = computeBadges({
      roundsDone: newRoundsDone,
      bestDistanceKm: newBestDist,
    });
    const newBadges = determineNewBadges(badgesBefore, badgesAfter);
    const { level, progress, progressMax } = calculateLevelAndProgress(newTotalScore);
    const educationalFact = EDUCATIONAL_FACTS[Math.floor(Math.random() * EDUCATIONAL_FACTS.length)];

    return res.json({
      ok: true,
      data: {
        answer,
        distanceKm,
        score: roundScore,
        totalScore: newTotalScore,
        level,
        progress,
        progressMax,
        newBadges,
        educationalFact,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/rounds/active
 * Mengembalikan ronde terbuka (status = 'open') milik pemain jika masih berlaku (< 5 menit).
 */
export async function getActiveRoundHandler(req, res, next) {
  try {
    const supabase = getSupabaseAdmin();

    // Tidak select horizon_seconds/difficulty — kolom tersebut mungkin belum ada di DB lama
    const { data: openRounds, error: fetchErr } = await supabase
      .from('rounds')
      .select('id, target_ts, created_at, status')
      .eq('player_id', req.playerId)
      .eq('status', 'open');

    if (fetchErr) throw fetchErr;

    if (!openRounds || openRounds.length === 0) {
      return res.json({ ok: true, data: null });
    }

    const activeRound = openRounds[0];
    const ageMs = Date.now() - new Date(activeRound.created_at).getTime();

    if (ageMs > ROUND_EXPIRY_MS) {
      await supabase
        .from('rounds')
        .update({ status: 'expired' })
        .eq('id', activeRound.id)
        .eq('player_id', req.playerId);

      return res.json({ ok: true, data: null });
    }

    return res.json({
      ok: true,
      data: {
        roundId: activeRound.id,
        targetTs: activeRound.target_ts,
        startedAt: activeRound.created_at,
        horizonSeconds: FIXED_HORIZON,
        difficulty: FIXED_DIFFICULTY,
      },
    });
  } catch (err) {
    return next(err);
  }
}

router.get('/active', requireAuth, getActiveRoundHandler);
router.post('/', requireAuth, createRoundHandler);
router.post('/:id/guess', requireAuth, submitGuessHandler);

export default router;
