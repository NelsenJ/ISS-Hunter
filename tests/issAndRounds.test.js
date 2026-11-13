import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  getIssPositionNow,
  getIssTrail,
  getIssPositionAtTimestamp,
  setIssFetchFn,
} from '../src/lib/issApi.js';
import { issNowHandler, issTrailHandler } from '../src/routes/iss.js';
import { createRoundHandler } from '../src/routes/rounds.js';
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

test('getIssPositionNow mengembalikan data posisi ISS dari API eksternal', async () => {
  setIssFetchFn(async () => ({
    ok: true,
    json: async () => ({
      latitude: -12.34,
      longitude: 56.78,
      altitude: 418.5,
      velocity: 27580,
      timestamp: 1700000000,
    }),
  }));

  const data = await getIssPositionNow();
  assert.equal(data.latitude, -12.34);
  assert.equal(data.longitude, 56.78);
  assert.equal(data.altitude, 418.5);
  assert.equal(data.velocity, 27580);
  assert.equal(data.timestamp, 1700000000);
});

test('getIssPositionNow melakukan percobaan ulang saat panggilan pertama gagal', async () => {
  let callCount = 0;
  setIssFetchFn(async () => {
    callCount++;
    if (callCount === 1) {
      return { ok: false, status: 500 };
    }
    return {
      ok: true,
      json: async () => ({
        latitude: 10,
        longitude: 20,
        altitude: 400,
        velocity: 27000,
        timestamp: 1700000100,
      }),
    };
  });

  const data = await getIssPositionNow();
  assert.equal(callCount, 2);
  assert.equal(data.latitude, 10);
});

test('getIssPositionNow melempar 502 UPSTREAM_ERROR jika semua percobaan gagal', async () => {
  setIssFetchFn(async () => {
    throw new Error('Network timeout');
  });

  await assert.rejects(
    async () => getIssPositionNow(),
    (err) => err.status === 502 && err.code === 'UPSTREAM_ERROR',
  );
});

test('getIssTrail mengembalikan array koordinat posisi jejak lintasan', async () => {
  setIssFetchFn(async () => ({
    ok: true,
    json: async () => [
      { latitude: 1, longitude: 2, altitude: 400, velocity: 27000, timestamp: 100 },
      { latitude: 3, longitude: 4, altitude: 400, velocity: 27000, timestamp: 160 },
    ],
  }));

  const trail = await getIssTrail();
  assert.equal(Array.isArray(trail), true);
  assert.equal(trail.length, 2);
  assert.equal(trail[0].latitude, 1);
});

test('getIssPositionAtTimestamp mengambil satu titik koordinat pada waktu target', async () => {
  setIssFetchFn(async () => ({
    ok: true,
    json: async () => [
      { latitude: -5.1, longitude: 110.2, altitude: 415, velocity: 27600, timestamp: 1700000600 },
    ],
  }));

  const pos = await getIssPositionAtTimestamp(1700000600);
  assert.equal(pos.latitude, -5.1);
  assert.equal(pos.longitude, 110.2);
});

test('GET /api/iss/now menyertakan header Cache-Control proxy', async () => {
  setIssFetchFn(async () => ({
    ok: true,
    json: async () => ({
      latitude: 0,
      longitude: 0,
      altitude: 400,
      velocity: 27000,
      timestamp: 1000,
    }),
  }));

  const res = createMockResponse();
  await issNowHandler({}, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.headers['Cache-Control'], 'public, s-maxage=5, stale-while-revalidate=10');
});

test('GET /api/iss/trail menyertakan header Cache-Control proxy', async () => {
  setIssFetchFn(async () => ({
    ok: true,
    json: async () => [
      { latitude: 0, longitude: 0, altitude: 400, velocity: 27000, timestamp: 1000 },
    ],
  }));

  const res = createMockResponse();
  await issTrailHandler({}, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.headers['Cache-Control'], 'public, s-maxage=5, stale-while-revalidate=10');
});

test('POST /api/rounds membuat ronde baru dengan status 201 jika tidak ada ronde terbuka', async () => {
  const mockSupabase = {
    from(table) {
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { id: 'usr-1' }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'rounds') {
        return {
          select() {
            return {
              eq() {
                return {
                  async eq() {
                    return { data: [], error: null }; // Tidak ada ronde open
                  },
                };
              },
            };
          },
          insert({ _player_id, target_ts, status }) {
            assert.equal(status, 'open');
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 101,
                        target_ts,
                        created_at: new Date().toISOString(),
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { playerId: 'usr-1' };
  const res = createMockResponse();

  await createRoundHandler(req, res, () => {});

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.roundId, 101);
});

test('POST /api/rounds mengembalikan ronde terbuka yang masih valid (< 5 menit) dengan status 200', async () => {
  const validCreatedAt = new Date(Date.now() - 60 * 1000).toISOString(); // 1 menit yang lalu
  const mockSupabase = {
    from(table) {
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { id: 'usr-1' }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'rounds') {
        return {
          select() {
            return {
              eq() {
                return {
                  async eq() {
                    return {
                      data: [
                        {
                          id: 99,
                          target_ts: 1700000000,
                          created_at: validCreatedAt,
                          status: 'open',
                        },
                      ],
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { playerId: 'usr-1' };
  const res = createMockResponse();

  await createRoundHandler(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.roundId, 99);
});

test('POST /api/rounds menandai ronde > 5 menit sebagai expired lalu membuat ronde baru', async () => {
  const expiredCreatedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 menit yang lalu
  let updatedToExpired = false;

  const mockSupabase = {
    from(table) {
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { id: 'usr-1' }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'rounds') {
        return {
          select() {
            return {
              eq() {
                return {
                  async eq() {
                    return {
                      data: [
                        {
                          id: 88,
                          target_ts: 1700000000,
                          created_at: expiredCreatedAt,
                          status: 'open',
                        },
                      ],
                      error: null,
                    };
                  },
                };
              },
            };
          },
          update(fields) {
            if (fields.status === 'expired') {
              updatedToExpired = true;
            }
            return {
              eq() {
                return {
                  async eq() {
                    return { error: null };
                  },
                };
              },
            };
          },
          insert({ target_ts }) {
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 89,
                        target_ts,
                        created_at: new Date().toISOString(),
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { playerId: 'usr-1' };
  const res = createMockResponse();

  await createRoundHandler(req, res, () => {});

  assert.equal(updatedToExpired, true);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.roundId, 89);
});

test('POST /api/rounds menangkap error 23505 race condition dan mengembalikan ronde terbuka yang ada', async () => {
  const mockSupabase = {
    from(table) {
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { id: 'usr-1' }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'rounds') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      then(resolve) {
                        resolve({ data: [], error: null });
                      },
                      async single() {
                        return {
                          data: {
                            id: 77,
                            target_ts: 1700000000,
                            created_at: new Date().toISOString(),
                          },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert() {
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: null,
                      error: {
                        code: '23505',
                        message:
                          'duplicate key value violates unique constraint rounds_one_open_per_player',
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { playerId: 'usr-1' };
  const res = createMockResponse();

  await createRoundHandler(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.roundId, 77);
});
