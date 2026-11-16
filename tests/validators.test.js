import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateDisplayName,
  validateCoordinates,
  validateRoundId,
  usernameToEmail,
  validateHorizonSeconds,
  validateDifficulty,
  validateLeaderboardType,
} from '../src/validators.js';

test('validateDisplayName menerima nama 3 sampai 20 karakter', () => {
  assert.equal(validateDisplayName('Ali'), 'Ali'); // 3 karakter
  assert.equal(validateDisplayName('Budi Antariksa'), 'Budi Antariksa'); // 14 karakter
  assert.equal(validateDisplayName('12345678901234567890'), '12345678901234567890'); // 20 karakter
  assert.equal(validateDisplayName('  Astronot  '), 'Astronot'); // trim spasi
});

test('validateDisplayName menolak nama di bawah 3 karakter (contoh 2 karakter)', () => {
  assert.throws(
    () => validateDisplayName('AB'),
    (err) => err.code === 'INVALID_DISPLAY_NAME' && err.status === 400,
  );
  assert.throws(
    () => validateDisplayName('  X  '),
    (err) => err.code === 'INVALID_DISPLAY_NAME' && err.status === 400,
  );
});

test('validateDisplayName menolak nama di atas 20 karakter (contoh 21 karakter)', () => {
  assert.throws(
    () => validateDisplayName('123456789012345678901'),
    (err) => err.code === 'INVALID_DISPLAY_NAME' && err.status === 400,
  );
});

test('validateDisplayName menolak tipe selain string', () => {
  for (const bad of [null, undefined, 12345, {}, []]) {
    assert.throws(
      () => validateDisplayName(bad),
      (err) => err.code === 'INVALID_DISPLAY_NAME' && err.status === 400,
    );
  }
});

test('validateDisplayName menolak karakter kontrol', () => {
  assert.throws(
    () => validateDisplayName('Astronot\u0000'),
    (err) => err.code === 'INVALID_DISPLAY_NAME' && err.status === 400,
  );
});

test('validateCoordinates menerima koordinat valid', () => {
  const result = validateCoordinates(-6.2, 106.8);
  assert.equal(result.lat, -6.2);
  assert.equal(result.lng, 106.8);

  // Batas ekstrem
  assert.deepEqual(validateCoordinates(90, 180), { lat: 90, lng: 180 });
  assert.deepEqual(validateCoordinates(-90, -180), { lat: -90, lng: -180 });
});

test('validateCoordinates menolak koordinat di luar batas atau bukan angka', () => {
  assert.throws(
    () => validateCoordinates(90.1, 0),
    (err) => err.code === 'INVALID_COORDINATES' && err.status === 400,
  );
  assert.throws(
    () => validateCoordinates(-91, 0),
    (err) => err.code === 'INVALID_COORDINATES' && err.status === 400,
  );
  assert.throws(
    () => validateCoordinates(0, 180.5),
    (err) => err.code === 'INVALID_COORDINATES' && err.status === 400,
  );
  assert.throws(
    () => validateCoordinates(0, -181),
    (err) => err.code === 'INVALID_COORDINATES' && err.status === 400,
  );
  assert.throws(
    () => validateCoordinates('bukan-angka', 10),
    (err) => err.code === 'INVALID_COORDINATES' && err.status === 400,
  );
});

test('validateRoundId menerima angka bulat positif', () => {
  assert.equal(validateRoundId('42'), 42);
  assert.equal(validateRoundId(100), 100);
});

test('validateRoundId menolak nilai bukan angka bulat positif', () => {
  for (const bad of ['abc', '0', '-5', '3.14', null, undefined]) {
    assert.throws(
      () => validateRoundId(bad),
      (err) => err.code === 'INVALID_ROUND_ID' && err.status === 400,
    );
  }
});

test('usernameToEmail menghasilkan format email deterministik yang aman', () => {
  assert.equal(usernameToEmail('budi'), 'budi@isshunter.app');
  assert.equal(usernameToEmail('  Budi  '), 'budi@isshunter.app');
  assert.equal(usernameToEmail('Kapten_ISS'), 'kapten_5fiss@isshunter.app');
  assert.equal(usernameToEmail('user 123'), 'user_20123@isshunter.app');
});

test('validateHorizonSeconds menerima horizon sah dan memberikan nilai bawaan', () => {
  assert.equal(validateHorizonSeconds(undefined), 600);
  assert.equal(validateHorizonSeconds(null), 600);
  assert.equal(validateHorizonSeconds(''), 600);
  assert.equal(validateHorizonSeconds(120), 120);
  assert.equal(validateHorizonSeconds('600'), 600);
  assert.equal(validateHorizonSeconds(1800), 1800);
  assert.equal(validateHorizonSeconds(5400), 5400);

  assert.throws(
    () => validateHorizonSeconds(999),
    (err) => err.code === 'INVALID_HORIZON' && err.status === 400,
  );
});

test('validateDifficulty menerima tingkat kesulitan sah dan memberikan nilai bawaan', () => {
  assert.equal(validateDifficulty(undefined), 'normal');
  assert.equal(validateDifficulty(null), 'normal');
  assert.equal(validateDifficulty(''), 'normal');
  assert.equal(validateDifficulty('easy'), 'easy');
  assert.equal(validateDifficulty('NORMAL'), 'normal');
  assert.equal(validateDifficulty('hard'), 'hard');
  assert.equal(validateDifficulty('expert'), 'expert');

  assert.throws(
    () => validateDifficulty('impossible'),
    (err) => err.code === 'INVALID_DIFFICULTY' && err.status === 400,
  );
});

test('validateLeaderboardType menerima tipe sah dan memberikan nilai bawaan', () => {
  assert.equal(validateLeaderboardType(undefined), 'total');
  assert.equal(validateLeaderboardType('average'), 'average');
  assert.equal(validateLeaderboardType('today'), 'today');

  assert.throws(
    () => validateLeaderboardType('invalid-type'),
    (err) => err.code === 'INVALID_LEADERBOARD_TYPE' && err.status === 400,
  );
});
