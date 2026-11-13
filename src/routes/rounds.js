import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';

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

router.post('/', requireAuth, createRoundHandler);

export default router;
