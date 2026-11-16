/**
 * ISS Hunter — Map Module
 * Mengelola peta Leaflet, penanda ISS custom SVG, jejak orbit,
 * penanda tebakan dan jawaban, serta pergantian tema peta otomatis.
 */

const CARTO_KEY = 'cb1_59if_1_f4fa217bd7869394e9b6b87a';
const CARTO_LIGHT = `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`;
const CARTO_DARK = `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`;
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
let latestIssPos = null;
let lastKnownBearing = 0;
let lastTrailPoints = [];

/**
 * Menghitung sudut arah (bearing/heading) antara dua koordinat geografis.
 * Digunakan untuk mengarahkan panah terbang ISS sesuai orbit nyata.
 *
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Derajat rotasi (0 - 360)
 */
function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  let dLng = toRad(lng2 - lng1);
  if (dLng > Math.PI) dLng -= 2 * Math.PI;
  if (dLng < -Math.PI) dLng += 2 * Math.PI;

  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Memecah titik koordinat menjadi beberapa segmen jika melintasi garis antimeridian (-180° / 180°).
 * Mencegah bug garis Leaflet yang memotong seluruh peta secara horizontal.
 *
 * @param {Array<{ lat: number, lng: number }>} points
 * @returns {Array<Array<[number, number]>>}
 */
function splitAntimeridianSegments(points) {
  if (!points || points.length === 0) return [];
  const segments = [];
  let currentSegment = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (currentSegment.length > 0) {
      const prev = currentSegment[currentSegment.length - 1];
      // Jika selisih longitude > 180°, lintasan melintasi antimeridian
      if (Math.abs(p.lng - prev[1]) > 180) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
    currentSegment.push([p.lat, p.lng]);
  }
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  return segments;
}

/**
 * Menyesuaikan longitude titik target agar berada di kelipatan dunia (world copy)
 * terdekat dengan referenceLng, sehingga tidak melompat ke ujung peta yang berlawanan
 * saat melintasi batas antimeridian Pasifik (180° / -180°).
 *
 * Contoh kasus nyata:
 * - ISS terbang melintasi Jepang (+140°) ke Samudra Pasifik (+170°) mengarah ke tenggara.
 * - 10 menit kemudian, ISS melintasi bujur 180° ke Pasifik Selatan (-160°).
 * - Tanpa fungsi ini, titik -160° akan digambar di ujung paling kiri peta (dekat Amerika),
 *   padahal secara geografis bola bumi ia berada tepat di sebelah kanan titik +170°.
 *
 * @param {number} targetLng
 * @param {number} referenceLng
 * @returns {number}
 */
export function adjustRelativeLng(targetLng, referenceLng) {
  let diff = targetLng - referenceLng;
  while (diff > 180) {
    targetLng -= 360;
    diff -= 360;
  }
  while (diff < -180) {
    targetLng += 360;
    diff += 360;
  }
  return Number(targetLng.toFixed(4));
}

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
 * Membuat custom DivIcon SVG untuk penanda ISS dengan indikator panah arah orbit.
 *
 * @param {number} bearing
 */
function createIssIcon(bearing = 0) {
  return window.L.divIcon({
    className: 'iss-custom-marker',
    html: `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--accent);filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="11" stroke="currentColor" stroke-width="1.8" opacity="0.85"/>
          <circle cx="16" cy="16" r="3.5" fill="currentColor"/>
          <line x1="16" y1="1" x2="16" y2="5" stroke="currentColor" stroke-width="1.5"/>
          <line x1="16" y1="27" x2="16" y2="31" stroke="currentColor" stroke-width="1.5"/>
          <line x1="1" y1="16" x2="5" y2="16" stroke="currentColor" stroke-width="1.5"/>
          <line x1="27" y1="16" x2="31" y2="16" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <div style="position:absolute;width:100%;height:100%;display:flex;align-items:flex-start;justify-content:center;transform:rotate(${bearing}deg);pointer-events:none;">
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid var(--accent);transform:translateY(-5px);"></div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createGuessIcon() {
  return window.L.divIcon({
    className: 'guess-custom-marker',
    html: `
      <div style="width:18px;height:18px;border-radius:50%;background-color:var(--text);border:2px solid var(--surface);box-shadow:0 2px 6px rgba(0,0,0,0.45);cursor:pointer;"></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function createAnswerIcon() {
  return window.L.divIcon({
    className: 'answer-custom-marker',
    html: `
      <div style="width:20px;height:20px;border-radius:50%;background-color:var(--accent);border:2px solid var(--surface);box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;"></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
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
 * Memperbarui posisi penanda ISS di peta dengan indikator arah rotasi orbit.
 *
 * @param {{ lat: number, lng: number }} pos
 */
export function updateIssPosition(pos) {
  if (!mapInstance) return;

  if (latestIssPos && (latestIssPos.lat !== pos.lat || latestIssPos.lng !== pos.lng)) {
    lastKnownBearing = calculateBearing(latestIssPos.lat, latestIssPos.lng, pos.lat, pos.lng);
  }
  latestIssPos = pos;

  const latlng = [pos.lat, pos.lng];

  if (!issMarker) {
    issMarker = window.L.marker(latlng, {
      icon: createIssIcon(lastKnownBearing),
      zIndexOffset: 1000,
    }).addTo(mapInstance);
    issMarker.bindTooltip('ISS (Sedang Mengorbit)', {
      direction: 'top',
      offset: [0, -16],
      opacity: 0.9,
    });
  } else {
    issMarker.setLatLng(latlng);
    issMarker.setIcon(createIssIcon(lastKnownBearing));
  }

  // Otomatis sambungkan ujung terdepan jejak ke posisi baru ISS
  if (lastTrailPoints.length > 0) {
    renderTrailLines(lastTrailPoints);
  }
}

/**
 * Memperbarui jejak lintasan ISS (10 menit ke belakang).
 * Menghubungkan titik secara mulus ke posisi terdepan ISS saat ini,
 * dan memecah garis saat melintasi batas antimeridian.
 *
 * @param {Array<{ lat: number, lng: number }>} trailPoints
 */
export function updateIssTrail(trailPoints) {
  if (!trailPoints) return;
  lastTrailPoints = trailPoints;
  renderTrailLines(trailPoints);
}

function renderTrailLines(trailPoints) {
  if (!mapInstance || !issTrailLayer) return;

  issTrailLayer.clearLayers();

  if (!trailPoints || trailPoints.length === 0) return;

  // Sambungkan titik historis dengan posisi live ISS saat ini di ujungnya
  const fullPoints = [...trailPoints];
  if (latestIssPos) {
    fullPoints.push({ lat: latestIssPos.lat, lng: latestIssPos.lng });
  }

  if (fullPoints.length < 2) return;

  // Pecah menjadi segmen aman agar tidak memotong peta di antimeridian (180° / -180°)
  const segments = splitAntimeridianSegments(fullPoints);

  for (const seg of segments) {
    if (seg.length >= 2) {
      window.L.polyline(seg, {
        color: 'var(--accent)',
        weight: 3,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(issTrailLayer);
    }
  }
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

  // Sesuaikan longitude visual jawaban agar berada pada kelipatan dunia terdekat dengan tebakan pemain.
  // Mencegah titik melompat ke ujung kiri peta saat melintasi garis batas antimeridian Pasifik (180°/-180°).
  const visualAnswerLng = adjustRelativeLng(answerCoords.lng, guessCoords.lng);
  const visualAnswer = { lat: answerCoords.lat, lng: visualAnswerLng };

  // Pastikan penanda tebakan terpasang dan beri tooltip
  setGuessMarker(guessCoords);
  if (guessMarker) {
    guessMarker.bindTooltip('Tebakanmu', {
      permanent: true,
      direction: 'top',
      offset: [0, -12],
      opacity: 0.95,
    });
  }

  // Penanda jawaban nyata
  if (!answerMarker) {
    answerMarker = window.L.marker([visualAnswer.lat, visualAnswer.lng], {
      icon: createAnswerIcon(),
      zIndexOffset: 900,
    }).addTo(mapInstance);
  } else {
    answerMarker.setLatLng([visualAnswer.lat, visualAnswer.lng]);
  }

  answerMarker.bindTooltip('Posisi Sebenarnya (+10 Menit)', {
    permanent: true,
    direction: 'bottom',
    offset: [0, 12],
    opacity: 0.95,
  });

  // Garis penghubung putus-putus langsung antara tebakan dan jawaban
  if (connectionLine) {
    mapInstance.removeLayer(connectionLine);
  }

  connectionLine = window.L.polyline(
    [
      [guessCoords.lat, guessCoords.lng],
      [visualAnswer.lat, visualAnswer.lng],
    ],
    {
      color: 'var(--accent)',
      weight: 2.5,
      dashArray: '5, 8',
      opacity: 0.95,
    },
  ).addTo(mapInstance);

  // Sesuaikan batas pandang peta agar kedua titik terlihat nyaman berdampingan
  const bounds = window.L.latLngBounds(
    [guessCoords.lat, guessCoords.lng],
    [visualAnswer.lat, visualAnswer.lng],
  );

  mapInstance.fitBounds(bounds, {
    padding: [80, 80],
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
