import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { validateLeaderboardType } from '../validators.js';

const router = Router();

const LEADERBOARD_CACHE_HEADER = 'public, s-maxage=10, stale-while-revalidate=30';

/**
 * GET /api/leaderboard?type=total|average|today
 * Mengambil 20 pemain teratas berdasarkan tipe papan peringkat.
 * Dapat diakses tanpa login.
 */
export async function leaderboardHandler(req, res, next) {
  try {
    const type = validateLeaderboardType(req.query?.type);
    const supabase = getSupabaseAdmin();

    let viewName = 'leaderboard';
    let orderColumn = 'total_score';
    if (type === 'average') {
      viewName = 'leaderboard_average';
      orderColumn = 'avg_score';
    } else if (type === 'today') {
      viewName = 'leaderboard_today';
      orderColumn = 'total_score';
    }

    const { data, error } = await supabase
      .from(viewName)
      .select('*')
      .order(orderColumn, { ascending: false })
      .limit(20);

    if (error) throw error;

    const formatted = (data || []).map((row, idx) => ({
      rank: idx + 1,
      displayName: row.display_name,
      totalScore: Number(row.total_score || 0),
      roundsDone: Number(row.rounds_done || 0),
      avgScore:
        row.avg_score !== null && row.avg_score !== undefined
          ? Number(Number(row.avg_score).toFixed(1))
          : null,
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
