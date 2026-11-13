import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCspHeader, CSP_DIRECTIVES } from '../src/lib/csp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vercelJsonPath = path.join(__dirname, '..', 'vercel.json');

test('buildCspHeader menyusun semua direktif menjadi string header yang valid', () => {
  const header = buildCspHeader();
  assert.ok(typeof header === 'string');
  assert.ok(header.includes("default-src 'self'"));
  assert.ok(header.includes('https://cdn.jsdelivr.net'));
  assert.ok(header.includes('https://*.basemaps.cartocdn.com'));
  assert.ok(header.includes('https://*.supabase.co'));
  assert.ok(header.includes('https://api.wheretheiss.at'));
  assert.ok(header.includes('https://fonts.googleapis.com'));
  assert.ok(header.includes('https://fonts.gstatic.com'));
});

test('nilai Content-Security-Policy di vercel.json sama persis dengan modul src/lib/csp.js', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  const allRouteHeaderGroup = vercelConfig.headers.find((group) => group.source === '/(.*)');
  assert.ok(allRouteHeaderGroup, 'Grup header untuk /(.*) harus ada di vercel.json');

  const cspHeader = allRouteHeaderGroup.headers.find(
    (h) => h.key.toLowerCase() === 'content-security-policy',
  );
  assert.ok(cspHeader, 'Header Content-Security-Policy harus ada di vercel.json');

  const expectedCsp = buildCspHeader(CSP_DIRECTIVES);
  assert.equal(
    cspHeader.value,
    expectedCsp,
    'Header CSP di vercel.json harus identik dengan keluaran buildCspHeader()',
  );
});

test('vercel.json memuat header keamanan nosniff, frame DENY, dan Referrer-Policy', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  const allRouteHeaderGroup = vercelConfig.headers.find((group) => group.source === '/(.*)');
  const headerMap = Object.fromEntries(
    allRouteHeaderGroup.headers.map((h) => [h.key.toLowerCase(), h.value]),
  );

  assert.equal(headerMap['x-content-type-options'], 'nosniff');
  assert.equal(headerMap['x-frame-options'], 'DENY');
  assert.equal(headerMap['referrer-policy'], 'strict-origin-when-cross-origin');
});
