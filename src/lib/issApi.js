import { AppError } from './errors.js';

const ISS_API_BASE_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
const ATTEMPT_TIMEOUT_MS = 3000;
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 2;

let customFetchFn = null;

/**
 * Mengatur fungsi fetch kustom (berguna untuk pengujian unit).
 *
 * @param {typeof fetch | null} fn
 */
export function setIssFetchFn(fn) {
  customFetchFn = fn;
}

function getFetchFn() {
  return customFetchFn || fetch;
}

/**
 * Menjalankan fetch dengan batas waktu (timeout) dan percobaan ulang otomatis.
 *
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchWithRetry(url) {
  const fetchFn = getFetchFn();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchFn(url, {
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Upstream API returned status ${response.status}`);
      }

      return await response.json();
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        throw AppError.badGateway(
          'Layanan posisi ISS tidak dapat dijangkau. Coba beberapa saat lagi.',
          'UPSTREAM_ERROR',
        );
      }
    }
  }
}

/**
 * Mengambil posisi ISS sekarang.
 */
export async function getIssPositionNow() {
  const data = await fetchWithRetry(ISS_API_BASE_URL);
  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    altitude: Number(data.altitude),
    velocity: Number(data.velocity),
    timestamp: Number(data.timestamp),
  };
}

/**
 * Mengambil jejak lintasan 10 menit terakhir (10 titik, per 60 detik).
 */
export async function getIssTrail() {
  const nowTs = Math.floor(Date.now() / 1000);
  const timestamps = [];
  for (let i = 9; i >= 0; i--) {
    timestamps.push(nowTs - i * 60);
  }

  const url = `${ISS_API_BASE_URL}/positions?timestamps=${timestamps.join(',')}`;
  const data = await fetchWithRetry(url);

  if (!Array.isArray(data)) {
    throw AppError.badGateway('Data jejak ISS tidak valid.', 'UPSTREAM_ERROR');
  }

  return data.map((pos) => ({
    latitude: Number(pos.latitude),
    longitude: Number(pos.longitude),
    altitude: Number(pos.altitude),
    velocity: Number(pos.velocity),
    timestamp: Number(pos.timestamp),
  }));
}

/**
 * Mengambil posisi ISS pada waktu target tertentu.
 * Digunakan server untuk menghitung jawaban ronde.
 *
 * @param {number} targetTs
 */
export async function getIssPositionAtTimestamp(targetTs) {
  const url = `${ISS_API_BASE_URL}/positions?timestamps=${targetTs}`;
  const data = await fetchWithRetry(url);

  if (!Array.isArray(data) || data.length === 0) {
    throw AppError.badGateway(
      'Gagal mendapatkan posisi target ISS dari layanan satelit.',
      'UPSTREAM_ERROR',
    );
  }

  const target = data[0];
  return {
    latitude: Number(target.latitude),
    longitude: Number(target.longitude),
    altitude: Number(target.altitude),
    velocity: Number(target.velocity),
    timestamp: Number(target.timestamp),
  };
}
