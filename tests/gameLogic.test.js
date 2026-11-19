import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateHaversineDistanceKm,
  calculateRoundScore,
  calculateLevelAndProgress,
  computeBadges,
  determineNewBadges,
  isDifficultyUnlocked,
  isHorizonUnlocked,
} from '../src/domain/gameLogic.js';

test('calculateHaversineDistanceKm menghasilkan 0 untuk dua titik yang sama', () => {
  const dist = calculateHaversineDistanceKm(-6.2, 106.8, -6.2, 106.8);
  assert.equal(dist, 0);
});

test('calculateHaversineDistanceKm menghitung jarak dua titik dengan akurat', () => {
  // London (51.5074, -0.1278) ke Paris (48.8566, 2.3522) sekitar 343-344 km
  const distLondonParis = calculateHaversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
  assert.ok(
    distLondonParis > 340 && distLondonParis < 348,
    `Jarak ${distLondonParis} di luar toleransi`,
  );

  // Jakarta (-6.2088, 106.8456) ke Tokyo (35.6762, 139.6503) sekitar 5770-5790 km
  const distJktTokyo = calculateHaversineDistanceKm(-6.2088, 106.8456, 35.6762, 139.6503);
  assert.ok(distJktTokyo > 5760 && distJktTokyo < 5800, `Jarak ${distJktTokyo} di luar toleransi`);

  // Jarak kutub ke kutub (maksimal sekitar 20015 km)
  const distPoles = calculateHaversineDistanceKm(90, 0, -90, 0);
  assert.ok(Math.abs(distPoles - 20015) < 20);
});

test('calculateRoundScore menghitung skor pada kasus batas 0, 500, dan 1500 km', () => {
  // Jarak 0 km -> 1000 poin
  assert.equal(calculateRoundScore(0), 1000);

  // Jarak 500 km -> round(1000 * e^(-1/3)) = round(716.53) = 717
  assert.equal(calculateRoundScore(500), 717);

  // Jarak 1500 km -> round(1000 * e^(-1)) = round(367.88) = 368
  assert.equal(calculateRoundScore(1500), 368);

  // Variasi tingkat kesulitan pada 0 km
  assert.equal(calculateRoundScore(0, 'easy'), 500); // 1000 * 0.5
  assert.equal(calculateRoundScore(0, 'normal'), 1000);
  assert.equal(calculateRoundScore(0, 'hard'), 1500); // 1000 * 1.5
  assert.equal(calculateRoundScore(0, 'expert'), 2000); // 1000 * 2.0

  // Variasi tingkat kesulitan pada 500 km
  assert.equal(calculateRoundScore(500, 'easy'), Math.round(1000 * Math.exp(-500 / 2500) * 0.5));
  assert.equal(calculateRoundScore(500, 'hard'), Math.round(1000 * Math.exp(-500 / 900) * 1.5));
  assert.equal(calculateRoundScore(500, 'expert'), Math.round(1000 * Math.exp(-500 / 600) * 2.0));
});

test('calculateRoundScore tidak pernah menghasilkan skor negatif pada jarak sangat jauh', () => {
  const farDistances = [5000, 10000, 20000, 40000, 100000];
  for (const dist of farDistances) {
    const score = calculateRoundScore(dist);
    assert.ok(score >= 0, `Skor untuk jarak ${dist} tidak boleh negatif`);
    assert.equal(Number.isInteger(score), true);
  }
});

test('calculateLevelAndProgress menghitung batas level dan progres skor', () => {
  // 0 poin: level 1, progres 0
  assert.deepEqual(calculateLevelAndProgress(0), { level: 1, progress: 0, progressMax: 2000 });

  // 1999 poin: level 1, progres 1999
  assert.deepEqual(calculateLevelAndProgress(1999), {
    level: 1,
    progress: 1999,
    progressMax: 2000,
  });

  // 2000 poin: tepat naik ke level 2, progres 0
  assert.deepEqual(calculateLevelAndProgress(2000), { level: 2, progress: 0, progressMax: 2000 });

  // 3999 poin: level 2, progres 1999
  assert.deepEqual(calculateLevelAndProgress(3999), {
    level: 2,
    progress: 1999,
    progressMax: 2000,
  });

  // 4000 poin: level 3, progres 0
  assert.deepEqual(calculateLevelAndProgress(4000), { level: 3, progress: 0, progressMax: 2000 });
});

test('computeBadges memeriksa batas syarat lencana Pemula, Navigator, Sniper, Orbit Penuh, dan Tanpa Jejak', () => {
  // Belum ada ronde
  assert.deepEqual(computeBadges(0, null), {
    pemula: false,
    hunter: false,
    navigator: false,
    sniper: false,
    orbitPenuh: false,
    tanpaJejak: false,
    skillIssue: false,
  });

  // 1 ronde selesai tapi jarak jauh (> 1000 km dan < 2000 km) -> hanya Pemula
  assert.deepEqual(computeBadges(1, 1200), {
    pemula: true,
    hunter: false,
    navigator: false,
    sniper: false,
    orbitPenuh: false,
    tanpaJejak: false,
    skillIssue: false,
  });

  // Kasus lencana Hunter: syarat < 1000 km
  assert.equal(computeBadges(1, 1000).hunter, false);
  assert.equal(computeBadges(1, 999.9).hunter, true);
  assert.equal(computeBadges(1, 800).hunter, true);

  // Kasus lencana Skill Issue: syarat > 2000 km
  assert.equal(computeBadges({ roundsDone: 1, worstDistanceKm: 2000 }).skillIssue, false);
  assert.equal(computeBadges({ roundsDone: 1, worstDistanceKm: 2001 }).skillIssue, true);
  assert.equal(computeBadges({ roundsDone: 1, hasSkillIssue: true }).skillIssue, true);

  // Kasus batas Navigator: syarat < 500 km
  assert.equal(computeBadges(1, 500).navigator, false); // tepat 500 km belum dapat
  assert.equal(computeBadges(1, 499.9).navigator, true); // < 500 km dapat
  assert.equal(computeBadges(1, 499).navigator, true);

  // Kasus batas Sniper: syarat < 100 km
  assert.equal(computeBadges(1, 100).sniper, false); // tepat 100 km belum dapat
  assert.equal(computeBadges(1, 99.9).sniper, true); // < 100 km dapat
  assert.equal(computeBadges(1, 99).sniper, true);

  // Tebakan sangat presisi (< 100 km) mendapatkan ketiga lencana
  assert.equal(computeBadges(1, 50).pemula, true);
  assert.equal(computeBadges(1, 50).navigator, true);
  assert.equal(computeBadges(1, 50).sniper, true);

  // Lencana Orbit Penuh (horizon 90 menit < 500 km)
  assert.equal(computeBadges({ roundsDone: 1, bestOrbitDistanceKm: 420 }).orbitPenuh, true);
  assert.equal(computeBadges({ roundsDone: 1, bestOrbitDistanceKm: 600 }).orbitPenuh, false);

  // Lencana Tanpa Jejak (tingkat Pakar < 500 km)
  assert.equal(computeBadges({ roundsDone: 1, bestExpertDistanceKm: 310 }).tanpaJejak, true);
  assert.equal(computeBadges({ roundsDone: 1, bestExpertDistanceKm: 550 }).tanpaJejak, false);
});

test('determineNewBadges mendeteksi lencana yang baru diperoleh dengan tepat', () => {
  const before1 = { pemula: false, navigator: false, sniper: false };
  const after1 = { pemula: true, navigator: false, sniper: false };
  assert.deepEqual(determineNewBadges(before1, after1), ['pemula']);

  const before2 = { pemula: true, navigator: false, sniper: false };
  const after2 = { pemula: true, navigator: true, sniper: false };
  assert.deepEqual(determineNewBadges(before2, after2), ['navigator']);

  const before3 = { pemula: true, navigator: true, sniper: false };
  const after3 = { pemula: true, navigator: true, sniper: true };
  assert.deepEqual(determineNewBadges(before3, after3), ['sniper']);

  // Tidak ada lencana baru
  assert.deepEqual(determineNewBadges(after3, after3), []);

  const before4 = { orbitPenuh: false, tanpaJejak: false };
  const after4 = { orbitPenuh: true, tanpaJejak: true };
  assert.deepEqual(determineNewBadges(before4, after4), ['orbitPenuh', 'tanpaJejak']);

  const before5 = { hunter: false, skillIssue: false };
  const after5 = { hunter: true, skillIssue: true };
  assert.deepEqual(determineNewBadges(before5, after5), ['hunter', 'skillIssue']);
});

test('isDifficultyUnlocked dan isHorizonUnlocked memeriksa pembukaan fitur berdasarkan level', () => {
  // Kesulitan: Mudah (Lv. 1), Normal (Lv. 1), Sulit (Lv. 3), Pakar (Lv. 5)
  assert.equal(isDifficultyUnlocked('easy', 1), true);
  assert.equal(isDifficultyUnlocked('normal', 1), true);
  assert.equal(isDifficultyUnlocked('hard', 1), false);
  assert.equal(isDifficultyUnlocked('hard', 3), true);
  assert.equal(isDifficultyUnlocked('expert', 4), false);
  assert.equal(isDifficultyUnlocked('expert', 5), true);

  // Horizon: 120 (Lv. 1), 600 (Lv. 1), 1800 (Lv. 2), 5400 (Lv. 4)
  assert.equal(isHorizonUnlocked(120, 1), true);
  assert.equal(isHorizonUnlocked(600, 1), true);
  assert.equal(isHorizonUnlocked(1800, 1), false);
  assert.equal(isHorizonUnlocked(1800, 2), true);
  assert.equal(isHorizonUnlocked(5400, 3), false);
  assert.equal(isHorizonUnlocked(5400, 4), true);
});
