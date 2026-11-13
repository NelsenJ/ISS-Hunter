import { AppError } from '../lib/errors.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Middleware untuk memverifikasi JWT Bearer token pemain.
 * Menggunakan getUser(token) dari Supabase Admin client.
 * Memasang `req.user` dan `req.playerId` untuk membatasi seluruh query selanjutnya.
 */
export async function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return next(AppError.unauthorized('Kamu perlu masuk dulu.', 'UNAUTHORIZED'));
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return next(AppError.unauthorized('Format token autentikasi tidak valid.', 'UNAUTHORIZED'));
  }

  const token = parts[1];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return next(AppError.unauthorized('Sesi tidak sah atau sudah kedaluwarsa.', 'UNAUTHORIZED'));
    }

    req.user = data.user;
    req.playerId = data.user.id;
    return next();
  } catch (err) {
    return next(err);
  }
}
