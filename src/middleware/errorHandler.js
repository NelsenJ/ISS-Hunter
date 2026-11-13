import { AppError } from '../lib/errors.js';

/** Dipasang setelah semua rute API: permintaan yang sampai ke sini berarti alamatnya tidak ada. */
export function notFoundHandler(_req, _res, next) {
  next(AppError.notFound('Alamat tidak ditemukan.', 'ROUTE_NOT_FOUND'));
}

/**
 * Satu-satunya tempat error diubah menjadi respons.
 * Format selalu sama: { ok: false, error: { code, message } }.
 * Express mengenali error handler dari jumlah parameternya (4), jadi `next` harus tetap ada.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const { status, code, message } = toAppError(err);

  // Detail teknis hanya masuk log server, tidak pernah dikirim ke pemain.
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  return res.status(status).json({ ok: false, error: { code, message } });
}

function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('Format JSON tidak valid.', 'INVALID_JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Data yang dikirim terlalu besar.');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Terjadi kesalahan di server. Coba lagi nanti.');
}
