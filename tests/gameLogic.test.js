import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateHaversineDistanceKm,
  calculateRoundScore,
  calculateLevelAndProgress,
  computeBadges,
  determineNewBadges,
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

test('computeBadges memeriksa batas syarat lencana Pemula, Navigator, dan Sniper', () => {
  // Belum ada ronde
  assert.deepEqual(computeBadges(0, null), { pemula: false, navigator: false, sniper: false });

  // 1 ronde selesai tapi jarak jauh (> 500 km) -> hanya Pemula
  assert.deepEqual(computeBadges(1, 1200), { pemula: true, navigator: false, sniper: false });

  // Kasus batas Navigator: syarat < 500 km
  assert.equal(computeBadges(1, 500).navigator, false); // tepat 500 km belum dapat
  assert.equal(computeBadges(1, 499.9).navigator, true); // < 500 km dapat
  assert.equal(computeBadges(1, 499).navigator, true);

  // Kasus batas Sniper: syarat < 100 km
  assert.equal(computeBadges(1, 100).sniper, false); // tepat 100 km belum dapat
  assert.equal(computeBadges(1, 99.9).sniper, true); // < 100 km dapat
  assert.equal(computeBadges(1, 99).sniper, true);

  // Tebakan sangat presisi (< 100 km) mendapatkan ketiga lencana
  assert.deepEqual(computeBadges(1, 50), { pemula: true, navigator: true, sniper: true });
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
});
