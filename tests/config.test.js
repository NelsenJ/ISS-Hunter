import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('memakai nilai bawaan saat environment kosong', () => {
  const config = loadConfig({});
  assert.equal(config.port, 3000);
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.isProduction, false);
});

test('membaca PORT dan NODE_ENV dari environment', () => {
  const config = loadConfig({
    PORT: '10000',
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'pk_demo',
    SUPABASE_SECRET_KEY: 'sk_demo',
  });
  assert.equal(config.port, 10000);
  assert.equal(config.isProduction, true);
});

test('menolak PORT yang bukan angka bulat 1-65535', () => {
  for (const bad of ['abc', '0', '70000', '3.5']) {
    assert.throws(() => loadConfig({ PORT: bad }), /PORT tidak valid/);
  }
});

test('menolak NODE_ENV yang tidak dikenal', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'staging' }), /NODE_ENV tidak valid/);
});

test('konfigurasi tidak bisa diubah setelah dibuat', () => {
  const config = loadConfig({});
  assert.throws(() => {
    config.port = 1;
  }, TypeError);
});

test('membaca URL dan kunci Supabase dari environment', () => {
  const config = loadConfig({
    SUPABASE_URL: 'https://contoh.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_contoh',
    SUPABASE_SECRET_KEY: 'sb_secret_contoh',
  });
  assert.equal(config.supabase.url, 'https://contoh.supabase.co');
  assert.equal(config.supabase.publishableKey, 'sb_publishable_contoh');
  assert.equal(config.supabase.secretKey, 'sb_secret_contoh');
});

test('gagal dengan pesan jelas jika kunci Supabase kosong saat requireSupabase aktif', () => {
  assert.throws(() => loadConfig({}, { requireSupabase: true }), /SUPABASE_URL wajib diisi/);

  assert.throws(
    () => loadConfig({ SUPABASE_URL: 'https://x.supabase.co' }, { requireSupabase: true }),
    /SUPABASE_PUBLISHABLE_KEY wajib diisi/,
  );

  assert.throws(
    () =>
      loadConfig(
        { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk' },
        { requireSupabase: true },
      ),
    /SUPABASE_SECRET_KEY wajib diisi/,
  );
});

test('gagal dengan pesan jelas pada lingkungan production jika kunci Supabase kosong', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SUPABASE_URL wajib diisi/);
});
