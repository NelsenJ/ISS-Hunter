/**
 * ISS Hunter — Game Logic Domain
 * Fungsi murni matematika dan logika permainan:
 * - Jarak Haversine (radius bumi 6371 km)
 * - Skor ronde: round(1000 * e^(-jarak / decay) * multiplier)
 * - Tingkat kesulitan: Mudah, Normal, Sulit, Pakar
 * - Horizon waktu: +2, +10, +30, +90 menit
 * - Level & progres: level = floor(total_skor / 2000) + 1, progres = total_skor % 2000
 * - Lencana: Pemula, Navigator, Sniper, Orbit Penuh, Tanpa Jejak
 */

export const EARTH_RADIUS_KM = 6371;
export const MAX_ROUND_SCORE = 1000;
export const SCORE_DECAY_CONSTANT = 1500;
export const POINTS_PER_LEVEL = 2000;
export const HUNTER_DISTANCE_THRESHOLD_KM = 1000;
export const NAVIGATOR_DISTANCE_THRESHOLD_KM = 500;
export const SNIPER_DISTANCE_THRESHOLD_KM = 100;
export const SKILL_ISSUE_DISTANCE_THRESHOLD_KM = 2000;

export const BADGE_METADATA = {
  pemula: {
    key: 'pemula',
    label: 'Pemula',
    hint: '1 ronde',
    desc: 'Menyelesaikan ronde pertamamu di ISS Hunter!',
    icon: 'rocket',
  },
  hunter: {
    key: 'hunter',
    label: 'Hunter',
    hint: '< 1000 km',
    desc: 'Tebakan akurat di bawah 1.000 km dari target ISS!',
    icon: 'target',
  },
  navigator: {
    key: 'navigator',
    label: 'Navigator',
    hint: '< 500 km',
    desc: 'Hebat! Tebakan presisi di bawah 500 km dari target ISS!',
    icon: 'route',
  },
  sniper: {
    key: 'sniper',
    label: 'Sniper',
    hint: '< 100 km',
    desc: 'Luar biasa! Tebakan super presisi di bawah 100 km!',
    icon: 'crosshair',
  },
  skillIssue: {
    key: 'skillIssue',
    label: 'Skill Issue',
    hint: '> 2000 km',
    desc: 'Waduh! Tebakan meleset lebih dari 2.000 km dari posisi ISS. Tetap semangat!',
    icon: 'alert-triangle',
  },
};

export const ALLOWED_HORIZONS_SECONDS = [
  120, 600, 900, 1200, 1800, 2400, 2700, 3600, 4500, 5400,
];
export const DEFAULT_HORIZON_SECONDS = 600;

export const HORIZON_DETAILS = {
  120: {
    seconds: 120,
    minutes: 2,
    label: '+2 Menit',
    distanceEstKm: 920,
    minLevel: 1,
    description: 'Prediksi kilat (~920 km)',
  },
  600: {
    seconds: 600,
    minutes: 10,
    label: '+10 Menit',
    distanceEstKm: 4600,
    minLevel: 1,
    description: 'Prediksi standar (~4.600 km, ~39° bujur)',
  },
  900: {
    seconds: 900,
    minutes: 15,
    label: '+15 Menit',
    distanceEstKm: 6900,
    minLevel: 1,
    description: 'Prediksi ~1/6 orbit Bumi (~6.900 km)',
  },
  1200: {
    seconds: 1200,
    minutes: 20,
    label: '+20 Menit',
    distanceEstKm: 9200,
    minLevel: 1,
    description: 'Prediksi ~1/4 orbit Bumi (~9.200 km)',
  },
  1800: {
    seconds: 1800,
    minutes: 30,
    label: '+30 Menit',
    distanceEstKm: 13800,
    minLevel: 2,
    description: 'Prediksi menengah (~13.800 km, ~1/3 keliling Bumi)',
  },
  2400: {
    seconds: 2400,
    minutes: 40,
    label: '+40 Menit',
    distanceEstKm: 18400,
    minLevel: 1,
    description: 'Prediksi ~43% orbit Bumi (~18.400 km)',
  },
  2700: {
    seconds: 2700,
    minutes: 45,
    label: '+45 Menit',
    distanceEstKm: 20700,
    minLevel: 1,
    description: 'Prediksi setengah Bumi (~20.700 km, belahan Bumi berlawanan)',
  },
  3600: {
    seconds: 3600,
    minutes: 60,
    label: '+60 Menit',
    distanceEstKm: 27600,
    minLevel: 1,
    description: 'Prediksi 2/3 orbit Bumi (~27.600 km)',
  },
  4500: {
    seconds: 4500,
    minutes: 75,
    label: '+75 Menit',
    distanceEstKm: 34500,
    minLevel: 1,
    description: 'Prediksi 5/6 orbit Bumi (~34.500 km)',
  },
  5400: {
    seconds: 5400,
    minutes: 90,
    label: '+90 Menit',
    distanceEstKm: 41400,
    minLevel: 4,
    description:
      'Satu orbit penuh (~92 menit). ISS kembali ke lintang hampir sama, bergeser ~23° ke barat karena rotasi Bumi.',
  },
};

export const DIFFICULTY_CONFIG = {
  easy: {
    key: 'easy',
    label: 'Mudah',
    decayConstant: 2500,
    multiplier: 0.5,
    showTrail: true,
    showGuide: true,
    showBearing: true,
    minLevel: 1,
    description: 'Peluruhan 2500 km, garis bantu arah aktif (Skor ×0.5)',
  },
  normal: {
    key: 'normal',
    label: 'Normal',
    decayConstant: 1500,
    multiplier: 1.0,
    showTrail: true,
    showGuide: false,
    showBearing: true,
    minLevel: 1,
    description: 'Peluruhan 1500 km, jejak orbit aktif (Skor ×1.0)',
  },
  hard: {
    key: 'hard',
    label: 'Sulit',
    decayConstant: 900,
    multiplier: 1.5,
    showTrail: true,
    showGuide: false,
    showBearing: true,
    minLevel: 3,
    description: 'Peluruhan 900 km, jejak tanpa garis bantu (Skor ×1.5)',
  },
  expert: {
    key: 'expert',
    label: 'Pakar',
    decayConstant: 600,
    multiplier: 2.0,
    showTrail: false,
    showGuide: false,
    showBearing: false,
    minLevel: 5,
    description: 'Peluruhan 600 km, tanpa jejak dan tanpa panah arah (Skor ×2.0)',
  },
};

export const ALLOWED_DIFFICULTIES = Object.keys(DIFFICULTY_CONFIG);
export const DEFAULT_DIFFICULTY = 'normal';

export const EDUCATIONAL_FACTS = [
  'ISS mengorbit Bumi sekitar 16 kali setiap 24 jam, menyaksikan 16 kali matahari terbit dan terbenam dalam sehari!',
  'Karena rotasi Bumi sebesar ~23° setiap 92 menit ke arah timur, setiap lintasan orbit ISS bergeser ke barat pada peta 2D.',
  'Stasiun Luar Angkasa Internasional terbang di ketinggian ~400 km di atas permukaan Bumi pada lapisan termosfer.',
  'Di ketinggian ISS, gravitasi Bumi masih ~90% dari permukaan. Sensasi melayang terjadi karena ISS terus-menerus jatuh bebas mengelilingi Bumi.',
  'ISS beroperasi dengan kecepatan ~27.600 km/jam (~7,6 km/detik), cukup untuk menyeberangi benua dalam beberapa menit.',
  'Panel surya ISS membentang seluas lapangan sepak bola untuk memasok listrik stasiun dan laboratorium ilmiahnya.',
  'Astronot di ISS menjalani olahraga minimal 2 jam sehari untuk mencegah atrofi otot dan pengeroposan tulang.',
];

/**
 * Memeriksa apakah tingkat kesulitan terbuka untuk level pemain tertentu.
 *
 * @param {string} difficultyKey
 * @param {number} playerLevel
 * @returns {boolean}
 */
export function isDifficultyUnlocked(difficultyKey, playerLevel) {
  const cfg = DIFFICULTY_CONFIG[difficultyKey];
  if (!cfg) return false;
  return (playerLevel || 1) >= cfg.minLevel;
}

/**
 * Memeriksa apakah horizon waktu terbuka untuk level pemain tertentu.
 *
 * @param {number} horizonSeconds
 * @param {number} playerLevel
 * @returns {boolean}
 */
export function isHorizonUnlocked(horizonSeconds, playerLevel) {
  const cfg = HORIZON_DETAILS[horizonSeconds];
  if (!cfg) return false;
  return (playerLevel || 1) >= cfg.minLevel;
}

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
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_KM * c;
}

/**
 * Menghitung skor ronde berdasarkan jarak tebakan pemain ke posisi ISS sebenarnya dan tingkat kesulitan.
 * Skor = round(1000 * e^(-jarak / decayConstant) * multiplier).
 * Skor minimal adalah 0 (tidak pernah negatif).
 *
 * @param {number} distanceKm Jarak dalam kilometer
 * @param {'easy' | 'normal' | 'hard' | 'expert' | object} [difficulty='normal']
 * @returns {number} Skor bulat
 */
export function calculateRoundScore(distanceKm, difficulty = 'normal') {
  if (distanceKm < 0) {
    throw new RangeError('Jarak tidak boleh negatif.');
  }

  const config =
    typeof difficulty === 'object' && difficulty !== null
      ? difficulty
      : DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.normal;

  const decay = config.decayConstant || SCORE_DECAY_CONSTANT;
  const mult = config.multiplier !== undefined ? config.multiplier : 1.0;

  const rawScore = MAX_ROUND_SCORE * Math.exp(-distanceKm / decay) * mult;
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
 * Mendukung pemanggilan tradisional (roundsDone, bestDist) maupun pemanggilan objek stats.
 *
 * @param {number | object} roundsDoneOrStats
 * @param {number | null} [bestDistanceKm=null]
 * @param {number | null} [bestExpertDistanceKm=null]
 * @param {number | null} [bestOrbitDistanceKm=null]
 * @returns {{ pemula: boolean, navigator: boolean, sniper: boolean, orbitPenuh: boolean, tanpaJejak: boolean }}
 */
export function computeBadges(
  roundsDoneOrStats,
  bestDistanceKm = null,
  bestExpertDistanceKm = null,
  bestOrbitDistanceKm = null,
  hasSkillIssueParam = false,
) {
  let count = 0;
  let best = null;
  let bestExpert = null;
  let bestOrbit = null;
  let hasSkillIssue = false;

  if (typeof roundsDoneOrStats === 'object' && roundsDoneOrStats !== null) {
    count = Number(roundsDoneOrStats.roundsDone ?? roundsDoneOrStats.rounds_done) || 0;
    const rawBest = roundsDoneOrStats.bestDistanceKm ?? roundsDoneOrStats.best_distance_km;
    best = rawBest !== null && rawBest !== undefined ? Number(rawBest) : null;

    const rawExpert =
      roundsDoneOrStats.bestExpertDistanceKm ?? roundsDoneOrStats.best_expert_distance_km;
    bestExpert = rawExpert !== null && rawExpert !== undefined ? Number(rawExpert) : null;

    const rawOrbit =
      roundsDoneOrStats.bestOrbitDistanceKm ?? roundsDoneOrStats.best_orbit_distance_km;
    bestOrbit = rawOrbit !== null && rawOrbit !== undefined ? Number(rawOrbit) : null;

    hasSkillIssue = Boolean(roundsDoneOrStats.hasSkillIssue ?? roundsDoneOrStats.skillIssue);
    if (!hasSkillIssue && roundsDoneOrStats.worstDistanceKm !== undefined && roundsDoneOrStats.worstDistanceKm !== null) {
      hasSkillIssue = Number(roundsDoneOrStats.worstDistanceKm) > SKILL_ISSUE_DISTANCE_THRESHOLD_KM;
    }
  } else {
    count = Number(roundsDoneOrStats) || 0;
    best = bestDistanceKm !== null && bestDistanceKm !== undefined ? Number(bestDistanceKm) : null;
    bestExpert =
      bestExpertDistanceKm !== null && bestExpertDistanceKm !== undefined
        ? Number(bestExpertDistanceKm)
        : null;
    bestOrbit =
      bestOrbitDistanceKm !== null && bestOrbitDistanceKm !== undefined
        ? Number(bestOrbitDistanceKm)
        : null;
    hasSkillIssue = Boolean(hasSkillIssueParam);
  }

  return {
    pemula: count >= 1,
    hunter: best !== null && best < HUNTER_DISTANCE_THRESHOLD_KM,
    navigator: best !== null && best < NAVIGATOR_DISTANCE_THRESHOLD_KM,
    sniper: best !== null && best < SNIPER_DISTANCE_THRESHOLD_KM,
    orbitPenuh: bestOrbit !== null && bestOrbit < 500,
    tanpaJejak: bestExpert !== null && bestExpert < 500,
    skillIssue: hasSkillIssue,
  };
}

/**
 * Membandingkan status lencana sebelum dan sesudah satu ronde untuk menentukan
 * lencana yang baru saja didapatkan pada ronde tersebut.
 *
 * @param {object} before
 * @param {object} after
 * @returns {Array<'pemula' | 'hunter' | 'navigator' | 'sniper' | 'orbitPenuh' | 'tanpaJejak' | 'skillIssue'>}
 */
export function determineNewBadges(before, after) {
  const newBadges = [];
  const keys = ['pemula', 'hunter', 'navigator', 'sniper', 'orbitPenuh', 'tanpaJejak', 'skillIssue'];

  for (const key of keys) {
    if (!before?.[key] && after?.[key]) {
      newBadges.push(key);
    }
  }

  return newBadges;
}
