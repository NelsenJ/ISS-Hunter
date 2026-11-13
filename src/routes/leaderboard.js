import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();

const LEADERBOARD_CACHE_HEADER = 'public, s-maxage=10, stale-while-revalidate=30';

/**
 * GET /api/leaderboard
 * Mengambil 20 pemain teratas berdasarkan total skor dari view leaderboard.
 * Dapat diakses tanpa login.
 */
export async function leaderboardHandler(_req, res, next) {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('leaderboard')
      .select('display_name, total_score, rounds_done, best_distance_km')
      .order('total_score', { ascending: false })
      .limit(20);

    if (error) throw error;

    const formatted = (data || []).map((row, idx) => ({
      rank: idx + 1,
      displayName: row.display_name,
      totalScore: Number(row.total_score || 0),
      roundsDone: Number(row.rounds_done || 0),
      bestDistanceKm:
        row.best_distance_km !== null && row.best_distance_km !== undefined
          ? Number(row.best_distance_km)
          : null,
    }));

    res.setHeader('Cache-Control', LEADERBOARD_CACHE_HEADER);
    return res.json({
      ok: true,
      data: formatted,
    });
  } catch (err) {
    return next(err);
  }
}

router.get('/', leaderboardHandler);

export default router;
