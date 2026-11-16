import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';
import {
  validateCoordinates,
  validateRoundId,
  validateHorizonSeconds,
  validateDifficulty,
} from '../validators.js';
import { getIssPositionAtTimestamp } from '../lib/issApi.js';
import {
  calculateHaversineDistanceKm,
  calculateRoundScore,
  calculateLevelAndProgress,
  computeBadges,
  determineNewBadges,
  isDifficultyUnlocked,
  isHorizonUnlocked,
  DIFFICULTY_CONFIG,
  HORIZON_DETAILS,
  EDUCATIONAL_FACTS,
} from '../domain/gameLogic.js';

const router = Router();

const ROUND_EXPIRY_MS = 5 * 60 * 1000; // 5 menit
const COOLDOWN_SECONDS = 10; // Cooldown 10 detik antar ronde selesai (anti-grinding)

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
      .select('id, target_ts, created_at, status, horizon_seconds, difficulty')
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
            horizonSeconds: activeRound.horizon_seconds || 600,
            difficulty: activeRound.difficulty || 'normal',
          },
        });
      }
    }

    // Validasi parameter horizon dan tingkat kesulitan
    const horizonSeconds = validateHorizonSeconds(req.body?.horizon_seconds);
    const difficulty = validateDifficulty(req.body?.difficulty);

    // Ambil statistik pemain untuk cek progresi level jika memilih fitur terkunci
    const needProgressionCheck = difficulty !== 'normal' || horizonSeconds !== 600;
    if (needProgressionCheck) {
      const { data: playerStats } = await supabase
        .from('player_stats')
        .select('total_score')
        .eq('player_id', req.playerId)
        .maybeSingle();

      const playerLevel = calculateLevelAndProgress(playerStats?.total_score || 0).level;

      if (!isDifficultyUnlocked(difficulty, playerLevel)) {
        const reqLevel = DIFFICULTY_CONFIG[difficulty]?.minLevel || 1;
        throw AppError.badRequest(
          `Tingkat kesulitan ${DIFFICULTY_CONFIG[difficulty]?.label || difficulty} terbuka di Level ${reqLevel}.`,
          'DIFFICULTY_LOCKED',
        );
      }

      if (!isHorizonUnlocked(horizonSeconds, playerLevel)) {
        const reqLevel = HORIZON_DETAILS[horizonSeconds]?.minLevel || 1;
        throw AppError.badRequest(
          `Horizon waktu ${HORIZON_DETAILS[horizonSeconds]?.label || horizonSeconds} terbuka di Level ${reqLevel}.`,
          'HORIZON_LOCKED',
        );
      }
    }

    // Cooldown 10 detik antar ronde selesai (C5 anti-grinding)
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

    // Buat ronde baru dengan horizon waktu yang dipilih
    const nowSec = Math.floor(Date.now() / 1000);
    const targetTs = nowSec + horizonSeconds;

    const { data: inserted, error: insertErr } = await supabase
      .from('rounds')
      .insert({
        player_id: req.playerId,
        target_ts: targetTs,
        horizon_seconds: horizonSeconds,
        difficulty,
        status: 'open',
      })
      .select('id, target_ts, created_at, horizon_seconds, difficulty')
      .single();

    if (insertErr) {
      // Jika terjadi tabrakan kueri bersamaan (race condition), tangkap 23505
      if (insertErr.code === '23505' || insertErr.message?.includes('rounds_one_open_per_player')) {
        const { data: reloaded, error: reloadErr } = await supabase
          .from('rounds')
          .select('id, target_ts, created_at, horizon_seconds, difficulty')
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
            horizonSeconds: reloaded.horizon_seconds || 600,
            difficulty: reloaded.difficulty || 'normal',
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
        horizonSeconds: inserted.horizon_seconds,
        difficulty: inserted.difficulty,
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
      .select('id, player_id, status, target_ts, created_at, difficulty, horizon_seconds')
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
      .select(
        'total_score, rounds_done, best_distance_km, best_expert_distance_km, best_orbit_distance_km',
      )
      .eq('player_id', req.playerId)
      .maybeSingle();

    const badgesBefore = computeBadges(prevStatsData || {});

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
    const roundScore = calculateRoundScore(distanceKm, round.difficulty || 'normal');

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
    const prevTotalScore = Number(prevStatsData?.total_score || 0);
    const prevRoundsDone = Number(prevStatsData?.rounds_done || 0);
    const prevBestDist =
      prevStatsData?.best_distance_km !== null && prevStatsData?.best_distance_km !== undefined
        ? Number(prevStatsData.best_distance_km)
        : null;
    const prevExpertDist =
      prevStatsData?.best_expert_distance_km !== null &&
      prevStatsData?.best_expert_distance_km !== undefined
        ? Number(prevStatsData.best_expert_distance_km)
        : null;
    const prevOrbitDist =
      prevStatsData?.best_orbit_distance_km !== null &&
      prevStatsData?.best_orbit_distance_km !== undefined
        ? Number(prevStatsData.best_orbit_distance_km)
        : null;

    const newTotalScore = prevTotalScore + roundScore;
    const newRoundsDone = prevRoundsDone + 1;
    const newBestDist = prevBestDist === null ? distanceKm : Math.min(prevBestDist, distanceKm);
    const isExpert = (round.difficulty || 'normal') === 'expert';
    const isOrbit = Number(round.horizon_seconds || 600) === 5400;

    const newBestExpert = isExpert
      ? prevExpertDist === null
        ? distanceKm
        : Math.min(prevExpertDist, distanceKm)
      : prevExpertDist;
    const newBestOrbit = isOrbit
      ? prevOrbitDist === null
        ? distanceKm
        : Math.min(prevOrbitDist, distanceKm)
      : prevOrbitDist;

    const badgesAfter = computeBadges({
      roundsDone: newRoundsDone,
      bestDistanceKm: newBestDist,
      bestExpertDistanceKm: newBestExpert,
      bestOrbitDistanceKm: newBestOrbit,
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
 * Jika tidak ada atau sudah kedaluwarsa, mengembalikan data: null (dan menandai status 'expired').
 */
export async function getActiveRoundHandler(req, res, next) {
  try {
    const supabase = getSupabaseAdmin();

    const { data: openRounds, error: fetchErr } = await supabase
      .from('rounds')
      .select('id, target_ts, created_at, status, horizon_seconds, difficulty')
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
        horizonSeconds: activeRound.horizon_seconds || 600,
        difficulty: activeRound.difficulty || 'normal',
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
