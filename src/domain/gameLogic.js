/**
 * ISS Hunter — Game Logic Domain
 * Fungsi murni matematika dan logika permainan:
 * - Jarak Haversine (radius bumi 6371 km)
 * - Skor ronde: round(1000 * e^(-jarak / 1500))
 * - Level & progres: level = floor(total_skor / 2000) + 1, progres = total_skor % 2000
 * - Lencana: Pemula (>= 1 ronde), Navigator (< 500 km), Sniper (< 100 km)
 */

export const EARTH_RADIUS_KM = 6371;
export const MAX_ROUND_SCORE = 1000;
export const SCORE_DECAY_CONSTANT = 1500;
export const POINTS_PER_LEVEL = 2000;
export const NAVIGATOR_DISTANCE_THRESHOLD_KM = 500;
export const SNIPER_DISTANCE_THRESHOLD_KM = 100;

/**
 * Menghitung jarak lingkaran besar (great-circle distance) antara dua titik koordinat
 * menggunakan rumus Haversine.
 *
 * @param {number} lat1 Latitude titik pertama (derajat)
 * @param {number} lon1 Longitude titik pertama (derajat)
 * @param {number} lat2 Latitude titik kedua (derajat)
 * @param {number} lon2 Longitude titik kedua (derajat)
 * @returns {number} Jarak dalam kilometer (km)
 */
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  // Ubah derajat ke radian
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  // Batasi a dalam rentang [0, 1] untuk mencegah galat domain matematika floating-point
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_KM * c;
}

/**
 * Menghitung skor ronde berdasarkan jarak tebakan pemain ke posisi ISS sebenarnya.
 * Skor = round(1000 * e^(-jarak / 1500)).
 * Skor minimal adalah 0 (tidak pernah negatif).
 *
 * @param {number} distanceKm Jarak dalam kilometer
 * @returns {number} Skor bulat antara 0 sampai 1000
 */
export function calculateRoundScore(distanceKm) {
  if (distanceKm < 0) {
    throw new RangeError('Jarak tidak boleh negatif.');
  }

  const rawScore = MAX_ROUND_SCORE * Math.exp(-distanceKm / SCORE_DECAY_CONSTANT);
  const rounded = Math.round(rawScore);

  return Math.max(0, rounded);
}

/**
 * Menghitung tingkat (level) dan progres bar berdasarkan total skor.
 *
 * @param {number} totalScore Total skor akumulasi pemain
 * @returns {{ level: number, progress: number, progressMax: number }}
 */
export function calculateLevelAndProgress(totalScore) {
  const score = Math.max(0, Math.floor(totalScore || 0));
  const level = Math.floor(score / POINTS_PER_LEVEL) + 1;
  const progress = score % POINTS_PER_LEVEL;

  return {
    level,
    progress,
    progressMax: POINTS_PER_LEVEL,
  };
}

/**
 * Menghitung status pencapaian lencana berdasarkan statistik ronde.
 * Lencana dihitung dari data ronde dan tidak disimpan secara terpisah di database.
 *
 * @param {number} roundsDone Jumlah ronde yang telah diselesaikan
 * @param {number | null} bestDistanceKm Jarak terbaik tebakan pemain (dalam km)
 * @returns {{ pemula: boolean, navigator: boolean, sniper: boolean }}
 */
export function computeBadges(roundsDone, bestDistanceKm) {
  const count = Number(roundsDone) || 0;
  const best =
    bestDistanceKm !== null && bestDistanceKm !== undefined ? Number(bestDistanceKm) : null;

  return {
    pemula: count >= 1,
    navigator: best !== null && best < NAVIGATOR_DISTANCE_THRESHOLD_KM,
    sniper: best !== null && best < SNIPER_DISTANCE_THRESHOLD_KM,
  };
}

/**
 * Membandingkan status lencana sebelum dan sesudah satu ronde untuk menentukan
 * lencana yang baru saja didapatkan pada ronde tersebut.
 *
 * @param {{ pemula: boolean, navigator: boolean, sniper: boolean }} before
 * @param {{ pemula: boolean, navigator: boolean, sniper: boolean }} after
 * @returns {Array<'pemula' | 'navigator' | 'sniper'>}
 */
export function determineNewBadges(before, after) {
  const newBadges = [];
  const keys = ['pemula', 'navigator', 'sniper'];

  for (const key of keys) {
    if (!before?.[key] && after?.[key]) {
      newBadges.push(key);
    }
  }

  return newBadges;
}

