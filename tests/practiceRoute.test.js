import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { practiceGuessHandler } from '../src/routes/practice.js';
import { setIssFetchFn } from '../src/lib/issApi.js';
import { setSupabaseClient } from '../src/lib/supabase.js';

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  setIssFetchFn(null);
  setSupabaseClient(null);
});

afterEach(() => {
  setIssFetchFn(null);
  setSupabaseClient(null);
});

test('POST /api/practice menolak koordinat yang tidak valid dengan 400', async () => {
  const req = {
    playerId: 'usr-practice-1',
    body: { lat: 999, lng: 12 },
  };
  const res = createMockResponse();
  let receivedError = null;

  await practiceGuessHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 400);
  assert.equal(receivedError.code, 'INVALID_COORDINATES');
});

test('POST /api/practice berhasil menghitung jarak dan jawaban tanpa menulis ke database', async () => {
  // Pastikan Supabase TIDAK PERNAH dipanggil (melempar error jika dipanggil)
  const mockSupabase = {
    from() {
      throw new Error('Database tidak boleh disentuh pada mode latihan!');
    },
  };
  setSupabaseClient(mockSupabase);

  // Mock API eksternal ISS untuk target timestamp (mengembalikan array posisi)
  setIssFetchFn(async () => ({
    ok: true,
    json: async () => [
      {
        latitude: -10.0,
        longitude: 120.0,
        altitude: 420.0,
        velocity: 27500,
        timestamp: 1700000600,
      },
    ],
  }));

  const req = {
    playerId: 'usr-practice-1',
    body: { lat: -10.0, lng: 120.0 }, // Koordinat tepat sama -> jarak 0 km
  };
  const res = createMockResponse();

  await practiceGuessHandler(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.distanceKm, 0);
  assert.deepEqual(res.body.data.answer, { lat: -10.0, lng: 120.0 });
  assert.ok(typeof res.body.data.message === 'string');
});

test('POST /api/practice mengembalikan 502 jika upstream API ISS gagal', async () => {
  setIssFetchFn(async () => ({
    ok: false,
    status: 500,
  }));

  const req = {
    playerId: 'usr-practice-1',
    body: { lat: 0, lng: 0 },
  };
  const res = createMockResponse();
  let receivedError = null;

  await practiceGuessHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 502);
  assert.equal(receivedError.code, 'UPSTREAM_ERROR');
});
