/**
 * ISS Hunter — Map Module
 * Mengelola peta Leaflet, penanda ISS custom SVG, jejak orbit,
 * penanda tebakan dan jawaban, serta pergantian tema peta otomatis.
 */

const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png';
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png';
const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

let mapInstance = null;
let tileLayer = null;
let issMarker = null;
let issTrailLayer = null;
let guessMarker = null;
let answerMarker = null;
let connectionLine = null;
let onMapClickCallback = null;

/**
 * Normalisasi longitude Leaflet ke rentang standar -180 sampai 180 derajat.
 * Menghindari nilai di luar rentang saat peta digeser berulang kali.
 *
 * @param {number} lng
 * @returns {number}
 */
export function normalizeLng(lng) {
  const norm = ((lng + 540) % 360) - 180;
  return Number(norm.toFixed(6));
}

/**
 * Membuat custom DivIcon SVG untuk penanda ISS.
 * Menggunakan cincin tipis dan titik tengah beraksen, bukan emoji atau pin Leaflet bawaan.
 */
function createIssIcon() {
  return window.L.divIcon({
    className: 'iss-custom-marker',
    html: `
      <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:var(--accent);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
          <line x1="12" y1="0" x2="12" y2="4" stroke="currentColor" stroke-width="1"/>
          <line x1="12" y1="20" x2="12" y2="24" stroke="currentColor" stroke-width="1"/>
          <line x1="0" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="1"/>
          <line x1="20" y1="12" x2="24" y2="12" stroke="currentColor" stroke-width="1"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createGuessIcon() {
  return window.L.divIcon({
    className: 'guess-custom-marker',
    html: `
      <div style="width:16px;height:16px;border-radius:50%;background-color:var(--text);border:2px solid var(--surface);box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function createAnswerIcon() {
  return window.L.divIcon({
    className: 'answer-custom-marker',
    html: `
      <div style="width:18px;height:18px;border-radius:50%;background-color:var(--accent);border:2px solid var(--surface);box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * Inisialisasi peta Leaflet pada elemen kontainer.
 *
 * @param {HTMLElement | string} containerEl
 * @param {'light' | 'dark'} currentTheme
 * @param {(coords: { lat: number, lng: number }) => void} onMapClick
 */
export function initMap(containerEl, currentTheme = 'light', onMapClick = null) {
  if (typeof window.L === 'undefined') {
    throw new Error('Pustaka Leaflet belum dimuat.');
  }

  onMapClickCallback = onMapClick;

  // Hapus peta lama jika pernah diinisialisasi
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  mapInstance = window.L.map(containerEl, {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 10,
    worldCopyJump: true,
  }).setView([0, 0], 2);

  // Pasang kontrol zoom di sudut kanan bawah agar tidak tertutup panel desktop
  window.L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

  const tileUrl = currentTheme === 'dark' ? CARTO_DARK : CARTO_LIGHT;
  tileLayer = window.L.tileLayer(tileUrl, {
    attribution: MAP_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(mapInstance);

  // Lapisan garis jejak ISS
  issTrailLayer = window.L.layerGroup().addTo(mapInstance);

  // Tangkap event klik pada peta untuk menaruh tebakan
  mapInstance.on('click', (e) => {
    const rawLat = e.latlng.lat;
    const rawLng = e.latlng.lng;
    const normLng = normalizeLng(rawLng);

    // Batasi lat ke rentang sah -90..90
    const clampedLat = Math.max(-90, Math.min(90, rawLat));

    if (onMapClickCallback) {
      onMapClickCallback({
        lat: Number(clampedLat.toFixed(4)),
        lng: Number(normLng.toFixed(4)),
      });
    }
  });

  return mapInstance;
}

/**
 * Mengganti tema peta dasar (CARTO Light atau Dark).
 *
 * @param {'light' | 'dark'} theme
 */
export function setMapTheme(theme) {
  if (!tileLayer) return;
  const targetUrl = theme === 'dark' ? CARTO_DARK : CARTO_LIGHT;
  tileLayer.setUrl(targetUrl);
}

/**
 * Memperbarui posisi penanda ISS di peta.
 *
 * @param {{ lat: number, lng: number }} pos
 */
export function updateIssPosition(pos) {
  if (!mapInstance) return;

  const latlng = [pos.lat, pos.lng];

  if (!issMarker) {
    issMarker = window.L.marker(latlng, {
      icon: createIssIcon(),
      zIndexOffset: 1000,
    }).addTo(mapInstance);
  } else {
    issMarker.setLatLng(latlng);
  }
}

/**
 * Memperbarui jejak lintasan ISS (10 menit ke belakang).
 *
 * @param {Array<{ lat: number, lng: number }>} trailPoints
 */
export function updateIssTrail(trailPoints) {
  if (!mapInstance || !issTrailLayer) return;

  issTrailLayer.clearLayers();

  if (!trailPoints || trailPoints.length < 2) return;

  const latlngs = trailPoints.map((p) => [p.lat, p.lng]);

  // Garis tipis beraksen dengan opasitas naik
  window.L.polyline(latlngs, {
    color: 'var(--accent)',
    weight: 2,
    opacity: 0.75,
  }).addTo(issTrailLayer);
}

/**
 * Menempatkan penanda tebakan pemain di peta.
 *
 * @param {{ lat: number, lng: number } | null} coords
 */
export function setGuessMarker(coords) {
  if (!mapInstance) return;

  if (!coords) {
    if (guessMarker) {
      mapInstance.removeLayer(guessMarker);
      guessMarker = null;
    }
    return;
  }

  const latlng = [coords.lat, coords.lng];

  if (!guessMarker) {
    guessMarker = window.L.marker(latlng, {
      icon: createGuessIcon(),
      zIndexOffset: 800,
    }).addTo(mapInstance);
  } else {
    guessMarker.setLatLng(latlng);
  }
}

/**
 * Menampilkan hasil ronde: penanda jawaban dan garis putus-putus ke tebakan,
 * lalu menyesuaikan batas pandang peta (fitBounds) secara fungsional.
 *
 * @param {{ lat: number, lng: number }} guessCoords
 * @param {{ lat: number, lng: number }} answerCoords
 */
export function showRoundResult(guessCoords, answerCoords) {
  if (!mapInstance) return;

  // Pastikan penanda tebakan terpasang
  setGuessMarker(guessCoords);

  // Penanda jawaban
  if (!answerMarker) {
    answerMarker = window.L.marker([answerCoords.lat, answerCoords.lng], {
      icon: createAnswerIcon(),
      zIndexOffset: 900,
    }).addTo(mapInstance);
  } else {
    answerMarker.setLatLng([answerCoords.lat, answerCoords.lng]);
  }

  // Garis penghubung putus-putus
  if (connectionLine) {
    mapInstance.removeLayer(connectionLine);
  }

  connectionLine = window.L.polyline(
    [
      [guessCoords.lat, guessCoords.lng],
      [answerCoords.lat, answerCoords.lng],
    ],
    {
      color: 'var(--accent)',
      weight: 1.5,
      dashArray: '4, 6',
      opacity: 0.9,
    },
  ).addTo(mapInstance);

  // Sesuaikan batas pandang peta
  const bounds = window.L.latLngBounds(
    [guessCoords.lat, guessCoords.lng],
    [answerCoords.lat, answerCoords.lng],
  );

  mapInstance.fitBounds(bounds, {
    padding: [60, 60],
    maxZoom: 6,
    animate: true,
    duration: 0.5,
  });
}

/**
 * Membersihkan garis hasil dan penanda jawaban saat memulai ronde baru.
 */
export function clearRoundResult() {
  if (!mapInstance) return;

  if (answerMarker) {
    mapInstance.removeLayer(answerMarker);
    answerMarker = null;
  }

  if (connectionLine) {
    mapInstance.removeLayer(connectionLine);
    connectionLine = null;
  }

  setGuessMarker(null);
}
