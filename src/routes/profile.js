import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateDisplayName, usernameToEmail } from '../validators.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';

const router = Router();

/**
 * POST /api/profile/register
 * Mendaftarkan akun baru menggunakan username dan password saja.
 * Menggunakan Supabase Admin API agar `email_confirm: true` langsung aktif
 * tanpa perlu verifikasi email atau pengiriman email.
 */
export async function registerHandler(req, res, next) {
  try {
    const cleanUsername = validateDisplayName(req.body?.username);
    const password = req.body?.password;

    if (!password || typeof password !== 'string' || password.length < 6) {
      throw AppError.badRequest('Kata sandi minimal 6 karakter.', 'INVALID_PASSWORD');
    }

    const supabase = getSupabaseAdmin();

    // 1. Pastikan username belum dipakai (case-insensitive)
    const { data: existingProfile, error: searchError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('display_name', cleanUsername)
      .maybeSingle();

    if (searchError) {
      throw searchError;
    }

    if (existingProfile) {
      throw AppError.conflict('Username sudah dipakai. Pilih username lain.', 'NAME_TAKEN');
    }

    // 2. Buat akun di Supabase Auth dengan email_confirm: true
    const dummyEmail = usernameToEmail(cleanUsername);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: dummyEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: cleanUsername },
    });

    if (authError) {
      if (authError.message?.toLowerCase().includes('already registered')) {
        throw AppError.conflict('Username sudah dipakai. Pilih username lain.', 'NAME_TAKEN');
      }
      throw AppError.badRequest(authError.message, 'AUTH_ERROR');
    }

    // 3. Masukkan ke tabel profiles
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert({ id: authData.user.id, display_name: cleanUsername })
      .select('id, display_name, created_at')
      .single();

    if (profileError) {
      if (
        profileError.code === '23505' ||
        profileError.message?.includes('profiles_display_name_unique')
      ) {
        throw AppError.conflict('Username sudah dipakai. Pilih username lain.', 'NAME_TAKEN');
      }
      throw profileError;
    }

    return res.status(201).json({
      ok: true,
      data: {
        id: profileData.id,
        displayName: profileData.display_name,
        createdAt: profileData.created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

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

router.post('/register', registerHandler);
router.post('/', requireAuth, createProfileHandler);

export default router;
