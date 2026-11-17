// ISS Hunter — Satellite Tracker Client (browser only)
// Mengambil posisi satelit dari proxy server (/api/iss/now, /api/iss/trail).
// Memiliki exponential backoff saat gagal agar tidak spam request.

import { getState } from './store.js';

const POLLING_INTERVAL_MS = 5000;        // polling normal setiap 5 detik
const MAX_BACKOFF_MS = 60_000;           // maksimal backoff 60 detik
const BACKOFF_FACTOR = 2;

let pollingTimer = null;
let isPolling = false;
let onPositionUpdateCallback = null;
let onTrailUpdateCallback = null;
let currentTrailHorizon = 600;
let consecutiveFailures = 0;
let currentBackoffMs = POLLING_INTERVAL_MS;
let tickCount = 0;
let visibilityListenerAttached = false;

export function setOnTrailUpdate(cb) { onTrailUpdateCallback = cb; }
export function setTrailHorizon(horizon) { currentTrailHorizon = Number(horizon) || 600; }

/** Proxy endpoint berdasarkan preferredSatellite */
function getProxyBase() {
  const { preferredSatellite = 'iss' } = getState();
  if (preferredSatellite === 'iss') return '/api/iss';
  return `/api/satellite/${preferredSatellite}`;
}

/** Fetch current position dari proxy server */
export async function fetchCurrentIssPosition() {
  const proxy = getProxyBase();
  const res = await fetch(`${proxy}/now`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Server proxy returned ${res.status}`);
  const payload = await res.json();
  const d = payload.data;
  return {
    lat: Number(d.latitude),
    lng: Number(d.longitude),
    altitude: Number(d.altitude),
    velocity: Number(d.velocity),
    timestamp: Number(d.timestamp),
  };
}

/** Fetch trail positions dari proxy server */
export async function fetchIssTrail(horizonSeconds = currentTrailHorizon) {
  const horizon = Number(horizonSeconds) || 600;
  const proxy = getProxyBase();
  const res = await fetch(`${proxy}/trail?horizon=${horizon}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Server proxy trail returned ${res.status}`);
  const payload = await res.json();
  return payload.data.map((p) => ({
    lat: Number(p.latitude),
    lng: Number(p.longitude),
    timestamp: Number(p.timestamp),
  }));
}

async function tick() {
  if (!isPolling) return;
  if (document.visibilityState === 'hidden') {
    scheduleNext();
    return;
  }
  try {
    const pos = await fetchCurrentIssPosition();
    if (!isPolling) return;
    if (onPositionUpdateCallback) onPositionUpdateCallback(pos);

    consecutiveFailures = 0;
    currentBackoffMs = POLLING_INTERVAL_MS;

    tickCount++;
    // Fetch trail setiap 5 tick (25 detik) atau saat pertama kali
    if ((tickCount === 1 || tickCount % 5 === 0) && onTrailUpdateCallback) {
      fetchIssTrail().then((trail) => {
        if (isPolling && onTrailUpdateCallback) onTrailUpdateCallback(trail);
      }).catch((e) => {
        console.warn('[iss.js] Trail fetch failed:', e.message);
      });
    }
  } catch (err) {
    consecutiveFailures++;
    currentBackoffMs = Math.min(POLLING_INTERVAL_MS * BACKOFF_FACTOR ** consecutiveFailures, MAX_BACKOFF_MS);
    console.warn(`[iss.js] Position fetch failed (attempt ${consecutiveFailures}):`, err.message);
  }
  scheduleNext();
}

function scheduleNext() {
  if (!isPolling) return;
  if (pollingTimer) clearTimeout(pollingTimer);
  pollingTimer = setTimeout(tick, currentBackoffMs);
}

/** Start periodic polling dengan exponential backoff saat gagal */
export function startIssPolling(callback) {
  onPositionUpdateCallback = callback;
  if (isPolling) return; // Sudah berjalan, jangan duplikasi

  isPolling = true;
  consecutiveFailures = 0;
  currentBackoffMs = POLLING_INTERVAL_MS;
  tickCount = 0;

  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }

  // Pasang listener visibilitychange HANYA SEKALI
  if (!visibilityListenerAttached && typeof document !== 'undefined') {
    visibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isPolling && !pollingTimer) {
        tick();
      }
    });
  }

  // Mulai siklus
  tick();
}

/** Hentikan polling sepenuhnya dan bersihkan timer */
export function stopIssPolling() {
  isPolling = false;
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}
