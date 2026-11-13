/**
 * ISS Hunter — ISS Tracker Client
 * Mengambil posisi ISS dan jejak lintasannya.
 * Mencoba memanggil API wheretheiss.at secara langsung; jika gagal (CORS / batas permintaan),
 * otomatis menggunakan endpoint cadangan server (/api/iss/now dan /api/iss/trail).
 */

const WHERETHEISS_BASE = 'https://api.wheretheiss.at/v1/satellites/25544';
const POLLING_INTERVAL_MS = 5000;

let usingProxy = false;
let pollingTimer = null;
let onPositionUpdateCallback = null;

export async function fetchCurrentIssPosition() {
  if (!usingProxy) {
    try {
      const res = await fetch(WHERETHEISS_BASE, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`Direct API returned ${res.status}`);
      const data = await res.json();
      return {
        lat: Number(data.latitude),
        lng: Number(data.longitude),
        altitude: Number(data.altitude),
        velocity: Number(data.velocity),
        timestamp: Number(data.timestamp),
      };
    } catch {
      usingProxy = true; // Beralih ke proxy server
    }
  }

  // Fallback ke server proxy
  const res = await fetch('/api/iss/now');
  if (!res.ok) throw new Error('Proxy ISS sekarang gagal.');
  const payload = await res.json();
  return {
    lat: payload.data.latitude,
    lng: payload.data.longitude,
    altitude: payload.data.altitude,
    velocity: payload.data.velocity,
    timestamp: payload.data.timestamp,
  };
}

export async function fetchIssTrail() {
  if (!usingProxy) {
    try {
      const nowTs = Math.floor(Date.now() / 1000);
      const timestamps = [];
      for (let i = 9; i >= 0; i--) {
        timestamps.push(nowTs - i * 60);
      }
      const res = await fetch(`${WHERETHEISS_BASE}/positions?timestamps=${timestamps.join(',')}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Direct API trail returned ${res.status}`);
      const data = await res.json();
      return data.map((p) => ({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        timestamp: Number(p.timestamp),
      }));
    } catch {
      usingProxy = true;
    }
  }

  // Fallback ke server proxy
  const res = await fetch('/api/iss/trail');
  if (!res.ok) throw new Error('Proxy ISS jejak gagal.');
  const payload = await res.json();
  return payload.data.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    timestamp: p.timestamp,
  }));
}

/**
 * Memulai pembaruan posisi ISS secara berkala.
 * Otomatis dihentikan saat tab diminimalkan / disembunyikan.
 */
export function startIssPolling(callback) {
  onPositionUpdateCallback = callback;

  async function tick() {
    if (document.visibilityState === 'hidden') return;
    try {
      const pos = await fetchCurrentIssPosition();
      if (onPositionUpdateCallback) {
        onPositionUpdateCallback(pos);
      }
    } catch (err) {
      console.warn('Gagal memuat posisi ISS:', err.message);
    }
  }

  // Panggilan pertama
  tick();

  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(tick, POLLING_INTERVAL_MS);

  // Pantau perpindahan tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
    }
  });
}

export function stopIssPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}
