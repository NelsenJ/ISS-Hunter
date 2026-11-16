import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';
import { calculateLevelAndProgress, computeBadges } from '../domain/gameLogic.js';

const router = Router();

/**
 * GET /api/me
 * Mengambil profil pemain, total skor, level, progres, dan lencana.
 * Mengembalikan 404 PROFILE_REQUIRED jika akun belum memiliki baris profil.
 */
export async function getMeHandler(req, res, next) {
  try {
    const supabase = getSupabaseAdmin();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, created_at')
      .eq('id', req.playerId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      throw AppError.notFound('Profil belum dibuat.', 'PROFILE_REQUIRED');
    }

    const { data: statsData, error: statsError } = await supabase
      .from('player_stats')
      .select(
        'total_score, rounds_done, best_distance_km, best_expert_distance_km, best_orbit_distance_km',
      )
      .eq('player_id', req.playerId)
      .maybeSingle();

    if (statsError) {
      throw statsError;
    }

    const totalScore = Number(statsData?.total_score || 0);
    const roundsDone = Number(statsData?.rounds_done || 0);
    const bestDistanceKm =
      statsData?.best_distance_km !== null && statsData?.best_distance_km !== undefined
        ? Number(statsData.best_distance_km)
        : null;
    const bestExpertDistanceKm =
      statsData?.best_expert_distance_km !== null &&
      statsData?.best_expert_distance_km !== undefined
        ? Number(statsData.best_expert_distance_km)
        : null;
    const bestOrbitDistanceKm =
      statsData?.best_orbit_distance_km !== null && statsData?.best_orbit_distance_km !== undefined
        ? Number(statsData.best_orbit_distance_km)
        : null;

    const { level, progress, progressMax } = calculateLevelAndProgress(totalScore);
    const badges = computeBadges(statsData);

    return res.json({
      ok: true,
      data: {
        player: {
          id: profile.id,
          displayName: profile.display_name,
          createdAt: profile.created_at,
        },
        stats: {
          totalScore,
          roundsDone,
          bestDistanceKm,
          bestExpertDistanceKm,
          bestOrbitDistanceKm,
          level,
          progress,
          progressMax,
          badges,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

router.get('/', requireAuth, getMeHandler);

export default router;
