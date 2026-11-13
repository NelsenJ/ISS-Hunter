import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { requireAuth } from '../src/middleware/auth.js';
import { createProfileHandler } from '../src/routes/profile.js';
import { getMeHandler } from '../src/routes/me.js';
import { setSupabaseClient } from '../src/lib/supabase.js';

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  setSupabaseClient(null);
});

afterEach(() => {
  setSupabaseClient(null);
});

test('requireAuth menolak permintaan tanpa header authorization dengan 401 UNAUTHORIZED', async () => {
  const req = { headers: {} };
  const res = createMockResponse();
  let receivedError = null;

  await requireAuth(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 401);
  assert.equal(receivedError.code, 'UNAUTHORIZED');
});

test('requireAuth menolak permintaan dengan format token bukan Bearer', async () => {
  const req = { headers: { authorization: 'Basic 12345' } };
  const res = createMockResponse();
  let receivedError = null;

  await requireAuth(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 401);
  assert.equal(receivedError.code, 'UNAUTHORIZED');
});

test('requireAuth menolak jika Supabase auth.getUser mengembalikan error', async () => {
  const mockSupabase = {
    auth: {
      async getUser(_token) {
        return { data: { user: null }, error: new Error('Token expired') };
      },
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { headers: { authorization: 'Bearer expired-token' } };
  const res = createMockResponse();
  let receivedError = null;

  await requireAuth(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 401);
  assert.equal(receivedError.code, 'UNAUTHORIZED');
});

test('requireAuth meloloskan token valid dan memasang req.user serta req.playerId', async () => {
  const mockUser = { id: 'usr-123', email: 'test@example.com' };
  const mockSupabase = {
    auth: {
      async getUser(token) {
        if (token === 'valid-token') {
          return { data: { user: mockUser }, error: null };
        }
        return { data: { user: null }, error: new Error('Invalid') };
      },
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { headers: { authorization: 'Bearer valid-token' } };
  const res = createMockResponse();
  let calledNext = false;

  await requireAuth(req, res, (err) => {
    assert.equal(err, undefined);
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(req.playerId, 'usr-123');
  assert.equal(req.user.email, 'test@example.com');
});

test('POST /api/profile menolak nama tidak valid dengan 400', async () => {
  const req = { playerId: 'usr-123', body: { display_name: 'ab' } };
  const res = createMockResponse();
  let receivedError = null;

  await createProfileHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 400);
  assert.equal(receivedError.code, 'INVALID_DISPLAY_NAME');
});

test('POST /api/profile menolak jika akun sudah memiliki profil (409 PROFILE_EXISTS)', async () => {
  const mockSupabase = {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: { id: 'usr-123' }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { playerId: 'usr-123', body: { display_name: 'Antariksa' } };
  const res = createMockResponse();
  let receivedError = null;

  await createProfileHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 409);
  assert.equal(receivedError.code, 'PROFILE_EXISTS');
});

test('POST /api/profile menangkap error Postgres 23505 dan mengembalikan 409 NAME_TAKEN', async () => {
  const mockSupabase = {
    from(table) {
      assert.equal(table, 'profiles');
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
        insert() {
          return {
            select() {
              return {
                async single() {
                  return {
                    data: null,
                    error: {
                      code: '23505',
                      message: 'duplicate key value violates unique constraint',
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

  const req = { playerId: 'usr-123', body: { display_name: 'SudahAda' } };
  const res = createMockResponse();
  let receivedError = null;

  await createProfileHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 409);
  assert.equal(receivedError.code, 'NAME_TAKEN');
});

test('POST /api/profile berhasil membuat profil baru (201)', async () => {
  const mockSupabase = {
    from(table) {
      assert.equal(table, 'profiles');
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
        insert({ id, display_name }) {
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      id,
                      display_name,
                      created_at: '2026-11-13T10:00:00.000Z',
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
  setSupabaseClient(mockSupabase);

  const req = { playerId: 'usr-123', body: { display_name: 'PemainSatu' } };
  const res = createMockResponse();

  await createProfileHandler(req, res, () => {});

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.id, 'usr-123');
  assert.equal(res.body.data.displayName, 'PemainSatu');
});

test('GET /api/me mengembalikan 404 PROFILE_REQUIRED jika baris profil belum dibuat', async () => {
  const mockSupabase = {
    from(table) {
      assert.equal(table, 'profiles');
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
    },
  };
  setSupabaseClient(mockSupabase);

  const req = { playerId: 'usr-tanpa-profil' };
  const res = createMockResponse();
  let receivedError = null;

  await getMeHandler(req, res, (err) => {
    receivedError = err;
  });

  assert.ok(receivedError);
  assert.equal(receivedError.status, 404);
  assert.equal(receivedError.code, 'PROFILE_REQUIRED');
});

test('GET /api/me mengembalikan profil, level, progress, dan status badges dengan benar', async () => {
  const mockSupabase = {
    from(table) {
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        id: 'usr-456',
                        display_name: 'BintangJatuh',
                        created_at: '2026-11-13T10:00:00.000Z',
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
      if (table === 'player_stats') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        total_score: 4500,
                        rounds_done: 5,
                        best_distance_km: 85.4,
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

  const req = { playerId: 'usr-456' };
  const res = createMockResponse();

  await getMeHandler(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.player.displayName, 'BintangJatuh');

  // Skor 4500: level floor(4500/2000) + 1 = 3, progress 4500 % 2000 = 500
  assert.equal(res.body.data.stats.level, 3);
  assert.equal(res.body.data.stats.progress, 500);
  assert.equal(res.body.data.stats.totalScore, 4500);

  // Badges: rounds_done 5 (pemula = true), best_distance_km 85.4 (< 500: navigator, < 100: sniper)
  assert.equal(res.body.data.stats.badges.pemula, true);
  assert.equal(res.body.data.stats.badges.navigator, true);
  assert.equal(res.body.data.stats.badges.sniper, true);
});
