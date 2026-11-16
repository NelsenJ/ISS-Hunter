import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLng, adjustRelativeLng } from '../public/js/map.js';

test('normalizeLng mempertahankan longitude dalam rentang standar -180 sampai 180', () => {
  assert.equal(normalizeLng(0), 0);
  assert.equal(normalizeLng(106.8456), 106.8456);
  assert.equal(normalizeLng(-73.9851), -73.9851);
  assert.equal(normalizeLng(180), -180); // 180 dan -180 adalah antimeridian yang sama
  assert.equal(normalizeLng(-180), -180);
});

test('normalizeLng menormalkan longitude lebih besar dari 180 (penggeseran ke kanan)', () => {
  assert.equal(normalizeLng(190), -170);
  assert.equal(normalizeLng(360), 0);
  assert.equal(normalizeLng(540), -180);
  assert.equal(normalizeLng(720), 0);
});

test('normalizeLng menormalkan longitude lebih kecil dari -180 (penggeseran ke kiri)', () => {
  assert.equal(normalizeLng(-190), 170);
  assert.equal(normalizeLng(-360), 0);
  assert.equal(normalizeLng(-540), -180);
});

test('adjustRelativeLng menyesuaikan longitude target saat melintasi antimeridian Pasifik (180°/-180°)', () => {
  // Kasus: Tebakan di Pasifik Barat (+165°), jawaban melintasi batas ke Pasifik Timur (-165°)
  // Jawaban harus dipetakan ke +195° agar tetap di sebelah kanan tebakan (+30° jarak sudut)
  assert.equal(adjustRelativeLng(-165, 165), 195);

  // Kasus kebalikan: Tebakan di Pasifik Timur (-170°), jawaban di Pasifik Barat (+170°)
  // Jawaban harus dipetakan ke -190° agar tetap di sebelah kiri tebakan (-20° jarak sudut)
  assert.equal(adjustRelativeLng(170, -170), -190);

  // Kasus normal (tidak melintasi batas 180°): nilai tidak berubah
  assert.equal(adjustRelativeLng(110, 106.8), 110);
  assert.equal(adjustRelativeLng(-74, -73), -74);
});
