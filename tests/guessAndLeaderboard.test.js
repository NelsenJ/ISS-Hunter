import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { submitGuessHandler } from '../src/routes/rounds.js';
import { leaderboardHandler } from '../src/routes/leaderboard.js';
import { setSupabaseClient } from '../src/lib/supabase.js';
import { setIssFetchFn } from '../src/lib/issApi.js';

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
  setSupabaseClient(null);
  setIssFetchFn(null);
});

afterEach(() => {
  setSupabaseClient(null);
  setIssFetchFn(null);
});

test('POST /api/rounds/:id/guess menolak jika ronde tidak ditemukan atau bukan milik pemain (404)', async () => {
  const mockSupabase = {
    from(table) {
      assert.equal(table, 'rounds');
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: null, error: null }; // Tidak ditemukan
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  setSupabaseClient(mockSupabase);

  const req = {
    params: { id: '10' },
    playerId: 'usr-123',
    body: { lat: 10.5, lng: 20.5 },
  };
  const res = createMockResponse();
  let receivedError = null;

  await submitGuessHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 404);
  assert.equal(receivedError.code, 'ROUND_NOT_FOUND');
});

test('POST /api/rounds/:id/guess menolak jika status ronde bukan open (409)', async () => {
  const mockSupabase = {
    from(table) {
      assert.equal(table, 'rounds');
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          id: 10,
                          player_id: 'usr-123',
                          status: 'done', // Sudah selesai
                          created_at: new Date().toISOString(),
                          target_ts: 1700000000,
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
      };
    },
  };
  setSupabaseClient(mockSupabase);

  const req = {
    params: { id: '10' },
    playerId: 'usr-123',
    body: { lat: 10.5, lng: 20.5 },
  };
  const res = createMockResponse();
  let receivedError = null;

  await submitGuessHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 409);
  assert.equal(receivedError.code, 'ROUND_ALREADY_FINISHED');
});

test('POST /api/rounds/:id/guess menolak jika ronde lewat 5 menit (410 GONE) dan menandai expired', async () => {
  let expiredMarked = false;
  const expiredCreatedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 menit lalu

  const mockSupabase = {
    from(table) {
      assert.equal(table, 'rounds');
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          id: 10,
                          player_id: 'usr-123',
                          status: 'open',
                          created_at: expiredCreatedAt,
                          target_ts: 1700000000,
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
        update(fields) {
          if (fields.status === 'expired') {
            expiredMarked = true;
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
      };
    },
  };
  setSupabaseClient(mockSupabase);

  const req = {
    params: { id: '10' },
    playerId: 'usr-123',
    body: { lat: 10.5, lng: 20.5 },
  };
  const res = createMockResponse();
  let receivedError = null;

  await submitGuessHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 410);
  assert.equal(receivedError.code, 'ROUND_EXPIRED');
  assert.equal(expiredMarked, true);
});

test('POST /api/rounds/:id/guess mengembalikan 502 jika API ISS gagal dan ronde tetap terbuka', async () => {
  const validCreatedAt = new Date(Date.now() - 60 * 1000).toISOString();
  let roundClosed = false;

  const mockSupabase = {
    from(table) {
      if (table === 'rounds') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: {
                            id: 10,
                            player_id: 'usr-123',
                            status: 'open',
                            created_at: validCreatedAt,
                            target_ts: 1700000000,
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
          update() {
            roundClosed = true;
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
        };
      }
      if (table === 'player_stats') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  setSupabaseClient(mockSupabase);

  // Simulasi API ISS mati/gagal
  setIssFetchFn(async () => {
    throw new Error('ISS API down');
  });

  const req = {
    params: { id: '10' },
    playerId: 'usr-123',
    body: { lat: 10.5, lng: 20.5 },
  };
  const res = createMockResponse();
  let receivedError = null;

  await submitGuessHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 502);
  assert.equal(receivedError.code, 'UPSTREAM_ERROR');
  assert.equal(roundClosed, false, 'Ronde tidak boleh ditutup jika API upstream gagal');
});

test('POST /api/rounds/:id/guess berhasil mengunci tebakan, menghitung jarak dan skor', async () => {
  const validCreatedAt = new Date(Date.now() - 60 * 1000).toISOString();
  let updatedFields = null;

  const mockSupabase = {
    from(table) {
      if (table === 'rounds') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: {
                            id: 15,
                            player_id: 'usr-456',
                            status: 'open',
                            created_at: validCreatedAt,
                            target_ts: 1700000600,
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
          update(fields) {
            updatedFields = fields;
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          select() {
                            return {
                              data: [{ id: 15, status: 'done' }],
                              error: null,
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'player_stats') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        total_score: 1500,
                        rounds_done: 1,
                        best_distance_km: 700,
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
      throw new Error(`Unexpected table ${table}`);
    },
  };
  setSupabaseClient(mockSupabase);

  // Simulasi ISS berada di dekat tebakan
  setIssFetchFn(async () => ({
    ok: true,
    json: async () => [
      {
        latitude: -6.2,
        longitude: 106.8,
        altitude: 418,
        velocity: 27500,
        timestamp: 1700000600,
      },
    ],
  }));

  const req = {
    params: { id: '15' },
    playerId: 'usr-456',
    body: { lat: -6.2, lng: 106.8 }, // Tebakan tepat di titik yang sama (jarak 0 km)
  };
  const res = createMockResponse();

  await submitGuessHandler(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.distanceKm, 0);
  assert.equal(res.body.data.score, 1000);
  assert.equal(res.body.data.totalScore, 2500); // 1500 + 1000 = 2500
  assert.equal(res.body.data.level, 2); // floor(2500/2000) + 1 = 2
  assert.equal(res.body.data.progress, 500); // 2500 % 2000 = 500

  // Sebelum: rounds_done 1, best 700 (pemula = true, navigator = false, sniper = false)
  // Sesudah: best 0 km (< 500 & < 100), lencana baru adalah navigator dan sniper!
  assert.ok(res.body.data.newBadges.includes('navigator'));
  assert.ok(res.body.data.newBadges.includes('sniper'));

  assert.equal(updatedFields.status, 'done');
  assert.equal(updatedFields.score, 1000);
  assert.equal(updatedFields.distance_km, 0);
});

test('GET /api/leaderboard mengembalikan 20 pemain teratas dan header Cache-Control', async () => {
  const mockRows = [
    { display_name: 'JuaraSatu', total_score: 9500, rounds_done: 10, best_distance_km: 12.3 },
    { display_name: 'JuaraDua', total_score: 8200, rounds_done: 9, best_distance_km: 45.0 },
  ];

  const mockSupabase = {
    from(table) {
      assert.equal(table, 'leaderboard');
      return {
        select() {
          return {
            order() {
              return {
                limit() {
                  return { data: mockRows, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  setSupabaseClient(mockSupabase);

  const res = createMockResponse();
  await leaderboardHandler({}, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.headers['Cache-Control'], 'public, s-maxage=10, stale-while-revalidate=30');

  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.data[0].rank, 1);
  assert.equal(res.body.data[0].displayName, 'JuaraSatu');
  assert.equal(res.body.data[0].totalScore, 9500);

  assert.equal(res.body.data[1].rank, 2);
  assert.equal(res.body.data[1].displayName, 'JuaraDua');
});
