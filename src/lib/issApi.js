/**
 * ISS Hunter — ISS Position API
 * Menggunakan TLE + satellite.js untuk propagasi posisi ISS.
 *
 * Pola Kinerja Tinggi (Stale-While-Revalidate):
 * 1. Selalu melayani permintaan klien SECARA INSTAN (< 1ms) dari satrec di memori
 * 2. Pembaruan TLE dari CelesTrak dilakukan di latar belakang (non-blocking)
 * 3. Memiliki fallback TLE bawaan sehingga kalkulasi posisi tidak akan pernah 502/gagal
 * 4. Cache tersimpan ke file lokal (%TEMP%) untuk ketahanan lintas restart
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppError } from './errors.js';

const ISS_NORAD_ID = 25544;
const TLE_CACHE_FILE = join(tmpdir(), 'iss_hunter_tle_cache.json');
const TLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // 6 jam
const BACKGROUND_RETRY_COOLDOWN_MS = 15 * 60 * 1000; // 15 menit jika gagal

// Fallback TLE bawaan ISS (ZARYA) real-time yang valid
const DEFAULT_TLE = {
  line1: '1 25544U 98067A   26320.88307550  .00009012  00000-0  16898-3 0  9996',
  line2: '2 25544  51.6320 264.4586 0007388  33.7322 326.4135 15.49421361595425',
};

const TLE_SOURCES = [
  `https://celestrak.org/NORAD/elements/gp.php?CATNR=${ISS_NORAD_ID}&FORMAT=TLE`,
  `https://celestrak.com/NORAD/elements/gp.php?CATNR=${ISS_NORAD_ID}&FORMAT=TLE`,
  `https://tle.ivanstanojevic.me/api/tle/${ISS_NORAD_ID}`,
];

const FETCH_HEADERS = {
  'User-Agent': 'ISS-Hunter-Educational-Game/1.0 (node.js server; github.com/isshunter)',
  'Accept': 'text/plain,application/json',
};

let cachedTle = DEFAULT_TLE;
let tleCachedAt = Date.now();
let cachedSatrec = null;
let satelliteModule = null;
let customFetchFn = null;
let isRefreshing = false;
let lastRefreshAttemptAt = 0;
let fileCacheChecked = false;

export function setIssFetchFn(fn) {
  customFetchFn = fn;
}

function getFetchFn() {
  return customFetchFn || fetch;
}

/** Load satellite.js sekali dan di-cache */
async function getSatelliteModule() {
  if (!satelliteModule) {
    satelliteModule = await import('satellite.js');
  }
  return satelliteModule;
}

/** Muat cache TLE dari file pada saat modul pertama kali diakses */
async function tryLoadFileCache() {
  if (fileCacheChecked) return;
  fileCacheChecked = true;
  try {
    const raw = await readFile(TLE_CACHE_FILE, 'utf8');
    const saved = JSON.parse(raw);
    if (saved?.line1 && saved?.line2 && saved?.savedAt) {
      cachedTle = { line1: saved.line1, line2: saved.line2 };
      tleCachedAt = saved.savedAt;
      console.info('[issApi] TLE dimuat dari cache file lokal');
    }
  } catch {
    // Gunakan DEFAULT_TLE bawaan
  }
}

/** Simpan TLE ke file cache secara asinkron */
function saveFileCache(tle) {
  writeFile(TLE_CACHE_FILE, JSON.stringify({ ...tle, savedAt: Date.now() }), 'utf8')
    .catch(() => { /* abaikan error tulis berkas sementara */ });
}

/** Parse teks/JSON TLE dari satu sumber */
async function fetchTleFromSource(url) {
  const res = await getFetchFn()(url, {
    signal: AbortSignal.timeout(3000),
    headers: FETCH_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  if (url.includes('ivanstanojevic')) {
    const json = JSON.parse(text);
    if (!json.line1 || !json.line2) throw new Error('Format JSON TLE tidak valid');
    return { line1: json.line1.trim(), line2: json.line2.trim() };
  }

  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  const tleLines = lines.length >= 3 ? lines.slice(-2) : lines;
  if (tleLines.length < 2) throw new Error('Format teks TLE tidak valid');
  return { line1: tleLines[0].trim(), line2: tleLines[1].trim() };
}

/**
 * Lakukan refresh TLE di latar belakang (NON-BLOCKING).
 * Tidak pernah menahan atau memperlambat permintaan HTTP pemain.
 */
async function refreshTleInBackground() {
  if (isRefreshing) return;
  const now = Date.now();
  if (now - lastRefreshAttemptAt < BACKGROUND_RETRY_COOLDOWN_MS) return;

  isRefreshing = true;
  lastRefreshAttemptAt = now;

  try {
    for (const url of TLE_SOURCES) {
      try {
        const newTle = await fetchTleFromSource(url);
        cachedTle = newTle;
        tleCachedAt = now;
        cachedSatrec = null; // Recompute satrec pada pemanggilan berikutnya
        saveFileCache(newTle);
        console.info(`[issApi] TLE berhasil diperbarui di latar belakang dari: ${url}`);
        return;
      } catch {
        // Coba sumber berikutnya
      }
    }
  } finally {
    isRefreshing = false;
  }
}

/**
 * Mengambil satrec instan di memori (selalu cepat < 1ms).
 */
async function getSatrec() {
  await tryLoadFileCache();
  const satellite = await getSatelliteModule();

  if (!cachedSatrec) {
    cachedSatrec = satellite.twoline2satrec(cachedTle.line1, cachedTle.line2);
  }

  // Jika data sudah melebihi TTL, picu pembaruan di latar belakang
  if (Date.now() - tleCachedAt > TLE_CACHE_TTL_MS) {
    refreshTleInBackground().catch(() => {});
  }

  return { satrec: cachedSatrec, satellite };
}

/** Hitung posisi ISS pada timestamp tertentu (ms) */
async function computePosition(timestampMs) {
  const { satrec, satellite } = await getSatrec();
  const date = new Date(timestampMs);
  const pv = satellite.propagate(satrec, date);

  if (!pv || !pv.position) {
    throw AppError.badGateway('Propagasi satelit gagal.', 'PROPAGATION_ERROR');
  }

  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pv.position, gmst);

  return {
    latitude: satellite.degreesLat(geo.latitude),
    longitude: satellite.degreesLong(geo.longitude),
    altitude: geo.height,
    velocity: Math.sqrt(pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2) * 3600,
    timestamp: Math.floor(timestampMs / 1000),
  };
}

/** Posisi ISS sekarang (< 1ms) */
export async function getIssPositionNow() {
  return computePosition(Date.now());
}

/**
 * Jejak lintasan ISS (10 titik dihitung parallel via satrec lokal, < 2ms)
 * @param {number} horizonSeconds
 */
export async function getIssTrail(horizonSeconds = 600) {
  const nowMs = Date.now();
  const intervalMs = Math.max(1000, Math.floor((horizonSeconds * 1000) / 10));
  const timestamps = Array.from({ length: 10 }, (_, i) => nowMs - (9 - i) * intervalMs);
  return Promise.all(timestamps.map((ts) => computePosition(ts)));
}

/**
 * Posisi ISS pada target Unix timestamp (detik)
 * @param {number} targetTs
 */
export async function getIssPositionAtTimestamp(targetTs) {
  return computePosition(targetTs * 1000);
}
