import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/lib/errors.js';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';

const req = { method: 'GET', originalUrl: '/api/contoh' };

function createFakeRes() {
  return {
    headersSent: false,
    statusCode: null,
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

test('AppError menjadi respons dengan format seragam', () => {
  const res = createFakeRes();
  errorHandler(AppError.gone('Ronde sudah kedaluwarsa.', 'ROUND_EXPIRED'), req, res, () => {});
  assert.equal(res.statusCode, 410);
  assert.deepEqual(res.body, {
    ok: false,
    error: { code: 'ROUND_EXPIRED', message: 'Ronde sudah kedaluwarsa.' },
  });
});

test('error tak dikenal menjadi 500 tanpa membocorkan detail', (t) => {
  t.mock.method(console, 'error', () => {});
  const res = createFakeRes();
  errorHandler(new Error('kata sandi database: rahasia'), req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(res.body).includes('rahasia'));
});

test('JSON rusak menjadi 400 INVALID_JSON', () => {
  const res = createFakeRes();
  const parseError = Object.assign(new SyntaxError('Unexpected token'), {
    type: 'entity.parse.failed',
  });
  errorHandler(parseError, req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'INVALID_JSON');
});

test('body terlalu besar menjadi 413', () => {
  const res = createFakeRes();
  errorHandler(
    Object.assign(new Error('too large'), { type: 'entity.too.large' }),
    req,
    res,
    () => {},
  );
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
});

test('jika header sudah terkirim, error diteruskan ke Express', () => {
  const res = createFakeRes();
  res.headersSent = true;
  const original = new Error('terlambat');
  let forwarded = null;
  errorHandler(original, req, res, (err) => {
    forwarded = err;
  });
  assert.equal(forwarded, original);
  assert.equal(res.statusCode, null);
});

test('notFoundHandler meneruskan AppError 404', () => {
  let received = null;
  notFoundHandler({}, {}, (err) => {
    received = err;
  });
  assert.equal(received.status, 404);
  assert.equal(received.code, 'ROUTE_NOT_FOUND');
});
