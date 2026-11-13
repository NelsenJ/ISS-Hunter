import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthHandler } from '../src/routes/health.js';
import { configHandler } from '../src/routes/config.js';

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

test('GET /api/health mengembalikan 200 dengan format seragam', () => {
  const req = {};
  const res = createMockResponse();

  healthHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.status, 'ok');
  assert.ok(typeof res.body.data.uptimeSeconds === 'number');
  assert.ok(typeof res.body.data.time === 'string');
});

test('GET /api/config mengembalikan URL dan publishableKey tanpa membocorkan secretKey', () => {
  const req = {};
  const res = createMockResponse();

  configHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok('supabaseUrl' in res.body.data);
  assert.ok('supabasePublishableKey' in res.body.data);
  assert.equal(res.body.data.supabaseSecretKey, undefined);
  assert.equal(res.body.data.secretKey, undefined);
});
