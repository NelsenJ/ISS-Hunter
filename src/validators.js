import { AppError } from './lib/errors.js';

const MIN_DISPLAY_NAME_LENGTH = 3;
const MAX_DISPLAY_NAME_LENGTH = 20;

/**
 * Validasi nama tampilan pemain (3 - 20 karakter).
 * Membersihkan spasi di awal dan akhir.
 * Melempar AppError jika tidak valid.
 *
 * @param {unknown} name
 * @returns {string} Nama yang sudah dibersihkan
 */
export function validateDisplayName(name) {
  if (typeof name !== 'string') {
    throw AppError.badRequest('Nama tampilan harus berupa teks.', 'INVALID_DISPLAY_NAME');
  }

  const trimmed = name.trim();
  const len = trimmed.length;

  if (len < MIN_DISPLAY_NAME_LENGTH || len > MAX_DISPLAY_NAME_LENGTH) {
    throw AppError.badRequest(
      `Nama tampilan harus antara ${MIN_DISPLAY_NAME_LENGTH} dan ${MAX_DISPLAY_NAME_LENGTH} karakter.`,
      'INVALID_DISPLAY_NAME',
    );
  }

  // Tolak karakter kontrol atau pemformatan tak terlihat
  for (let i = 0; i < len; i++) {
    const code = trimmed.charCodeAt(i);
    if ((code >= 0 && code <= 31) || (code >= 127 && code <= 159)) {
      throw AppError.badRequest(
        'Nama tampilan memuat karakter yang tidak diizinkan.',
        'INVALID_DISPLAY_NAME',
      );
    }
  }

  return trimmed;
}

/**
 * Validasi koordinat geografis (-90..90 untuk latitude, -180..180 untuk longitude).
 *
 * @param {unknown} lat
 * @param {unknown} lng
 * @returns {{ lat: number, lng: number }}
 */
export function validateCoordinates(lat, lng) {
  const numLat = Number(lat);
  const numLng = Number(lng);

  if (
    typeof lat === 'undefined' ||
    typeof lng === 'undefined' ||
    lat === null ||
    lng === null ||
    lat === '' ||
    lng === '' ||
    !Number.isFinite(numLat) ||
    !Number.isFinite(numLng)
  ) {
    throw AppError.badRequest('Koordinat harus berupa angka valid.', 'INVALID_COORDINATES');
  }

  if (numLat < -90 || numLat > 90) {
    throw AppError.badRequest('Latitude harus berada di antara -90 dan 90.', 'INVALID_COORDINATES');
  }

  if (numLng < -180 || numLng > 180) {
    throw AppError.badRequest(
      'Longitude harus berada di antara -180 dan 180.',
      'INVALID_COORDINATES',
    );
  }

  return { lat: numLat, lng: numLng };
}

/**
 * Validasi ID ronde (harus integer positif).
 *
 * @param {unknown} id
 * @returns {number}
 */
export function validateRoundId(id) {
  if (typeof id === 'undefined' || id === null || id === '') {
    throw AppError.badRequest('ID ronde wajib diisi.', 'INVALID_ROUND_ID');
  }

  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) {
    throw AppError.badRequest('ID ronde harus berupa angka bulat positif.', 'INVALID_ROUND_ID');
  }

  return num;
}
