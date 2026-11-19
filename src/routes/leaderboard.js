import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { validateLeaderboardType } from '../validators.js';

const router = Router();

const LEADERBOARD_CACHE_HEADER = 'public, s-maxage=10, stale-while-revalidate=30';

/**
 * GET /api/leaderboard?type=monthly|weekly|daily
 * Mengambil 20 pemain teratas berdasarkan periode waktu.
 * Dapat diakses tanpa login.
 */
export async function leaderboardHandler(req, res, next) {
  try {
    const type = validateLeaderboardType(req.query?.type);
    const supabase = getSupabaseAdmin();

    let viewName = 'leaderboard_monthly';
    if (type === 'weekly') {
      viewName = 'leaderboard_weekly';
    } else if (type === 'daily') {
      viewName = 'leaderboard_daily';
    }

    let { data, error } = await supabase
      .from(viewName)
      .select('*')
      .order('total_score', { ascending: false })
      .limit(20);

    // Jika view belum dibuat di Supabase (PGRST205 / 42P01), fallback ke view leaderboard lama atau []
    if (error && (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('schema cache'))) {
      console.warn(
        `[leaderboard] View '${viewName}' belum ada di Supabase. Jalankan 'supabase/migration_leaderboard_period.sql' di Supabase SQL Editor. Mencoba fallback ke view 'leaderboard' umum...`,
      );
      const fallback = await supabase
        .from('leaderboard')
        .select('*')
        .order('total_score', { ascending: false })
        .limit(20);

      if (!fallback.error) {
        data = fallback.data;
        error = null;
      } else {
        data = [];
        error = null;
      }
    }

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
