import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLng } from '../public/js/map.js';

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
