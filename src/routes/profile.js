import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateDisplayName } from '../validators.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';

const router = Router();

/**
 * POST /api/profile
 * Membuat profil baru untuk akun yang sedang login.
 * Menolak jika nama sudah dipakai (409 NAME_TAKEN) atau akun sudah punya profil (409 PROFILE_EXISTS).
 */
export async function createProfileHandler(req, res, next) {
  try {
    const cleanName = validateDisplayName(req.body?.display_name);
    const supabase = getSupabaseAdmin();

    // Pastikan akun ini belum memiliki profil
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', req.playerId)
      .maybeSingle();

    if (existingProfile) {
      throw AppError.conflict('Profil untuk akun ini sudah ada.', 'PROFILE_EXISTS');
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: req.playerId, display_name: cleanName })
      .select('id, display_name, created_at')
      .single();

    if (error) {
      // Kode error Postgres 23505 adalah unique_violation
      if (error.code === '23505' || error.message?.includes('profiles_display_name_unique')) {
        throw AppError.conflict('Nama tampilan sudah dipakai.', 'NAME_TAKEN');
      }
      throw error;
    }

    return res.status(201).json({
      ok: true,
      data: {
        id: data.id,
        displayName: data.display_name,
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

router.post('/', requireAuth, createProfileHandler);

export default router;
