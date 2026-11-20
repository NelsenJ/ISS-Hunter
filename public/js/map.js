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
let practiceLayer = null;
let isPracticeGuideActive = false;
let currentDifficulty = 'normal';

export function setMapDifficulty(diff) {
  currentDifficulty = diff || 'normal';
  if (currentDifficulty === 'expert') {
    if (issTrailLayer) issTrailLayer.clearLayers();
    if (!isPracticeGuideActive && practiceLayer) practiceLayer.clearLayers();
  } else {
    if (lastTrailPoints.length > 0) {
      renderTrailLines(lastTrailPoints);
    }
    if (currentDifficulty === 'easy' || isPracticeGuideActive) {
      if (latestIssPos) renderPracticeProjection(latestIssPos, lastKnownBearing);
    } else if (practiceLayer) {
      practiceLayer.clearLayers();
    }
  }

  if (issMarker && latestIssPos) {
    issMarker.setIcon(createIssIcon(lastKnownBearing, currentDifficulty !== 'expert'));
  }
}
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
 * @param {boolean} [showBearing=true]
 */
function createIssIcon(bearing = 0, showBearing = true) {
  const bearingArrowHtml = showBearing
    ? `<div style="position:absolute;width:100%;height:100%;display:flex;align-items:flex-start;justify-content:center;transform:rotate(${bearing}deg);pointer-events:none;">
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid var(--accent);transform:translateY(-5px);"></div>
        </div>`
    : '';

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
        ${bearingArrowHtml}
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

let lastRenderedBearing = null;

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
    destroyMap();
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const initialZoom = isMobile ? 2.5 : 3;

  mapInstance = window.L.map(containerEl, {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 10,
    zoomSnap: 0.5,
    preferCanvas: true, // Render semua vektor/polyline ke Canvas GPU hardware-accelerated
    worldCopyJump: false, // Nonaktifkan di mobile untuk menghilangkan stutter saat sentuhan/pan
    fadeAnimation: true,
    markerZoomAnimation: true,
  }).setView([0, 0], initialZoom);

  // Pasang kontrol zoom: kiri atas di mobile, kanan bawah di desktop
  window.L.control.zoom({ position: isMobile ? 'topleft' : 'bottomright' }).addTo(mapInstance);

  const tileUrl = currentTheme === 'dark' ? CARTO_DARK : CARTO_LIGHT;
  tileLayer = window.L.tileLayer(tileUrl, {
    attribution: MAP_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 19,
    updateWhenIdle: isMobile, // Di HP: hanya minta tile baru setelah pan selesai agar tidak lag
    updateWhenZooming: false,
    keepBuffer: isMobile ? 2 : 4,
  }).addTo(mapInstance);

  // Lapisan garis jejak ISS
  issTrailLayer = window.L.layerGroup().addTo(mapInstance);
  practiceLayer = window.L.layerGroup().addTo(mapInstance);

  // Tangkap event klik pada peta untuk menaruh tebakan
  mapInstance.on('click', (e) => {
    const rawLat = e.latlng.lat;
    const rawLng = e.latlng.lng;

    // Batasi lat ke rentang sah -90..90
    const clampedLat = Math.max(-90, Math.min(90, rawLat));

    if (onMapClickCallback) {
      onMapClickCallback({
        lat: Number(clampedLat.toFixed(4)),
        lng: Number(rawLng.toFixed(4)),
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

let hasAutoCentered = false;

/**
 * Mengarahkan pandangan peta langsung ke koordinat terkini ISS.
 * Pada laptop dan mobile, menghindari zoom-out berlebihan (min zoom 3 pada laptop) agar tidak memicu lag rendering tile.
 *
 * @param {number|null} [zoom=null]
 * @returns {boolean}
 */
export function centerOnIss(zoom = null, immediate = false) {
  if (!mapInstance || !latestIssPos) return false;
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const defaultZoom = isMobile ? 2.5 : 3;
  const targetZoom = zoom !== null ? zoom : defaultZoom;

  if (typeof mapInstance.invalidateSize === 'function') {
    mapInstance.invalidateSize();
  }

  let targetLatLng = [latestIssPos.lat, latestIssPos.lng];
  if (
    isMobile &&
    typeof mapInstance.project === 'function' &&
    typeof mapInstance.unproject === 'function'
  ) {
    const bottomSheet = typeof document !== 'undefined' ? document.getElementById('bottom-sheet') : null;
    if (bottomSheet && bottomSheet.dataset.state === 'expanded') {
      const sheetHeight = bottomSheet.offsetHeight || 160;
      const pt = mapInstance.project(targetLatLng, targetZoom);
      const offsetPt = pt.add([0, Math.round(sheetHeight / 3)]);
      const offsetCoords = mapInstance.unproject(offsetPt, targetZoom);
      targetLatLng = [offsetCoords.lat, offsetCoords.lng];
    }
  }

  if (!immediate && typeof mapInstance.flyTo === 'function') {
    mapInstance.flyTo(targetLatLng, targetZoom, { duration: 0.6 });
    return true;
  }

  if (typeof mapInstance.setView === 'function') {
    mapInstance.setView(targetLatLng, targetZoom, { animate: true });
    return true;
  }
  return false;
}

/**
 * Mengembalikan koordinat terakhir ISS yang tersimpan di memori.
 *
 * @returns {{ lat: number, lng: number } | null}
 */
export function getLatestIssPosition() {
  return latestIssPos;
}

/**
 * Memperbarui posisi penanda ISS di peta dengan indikator arah rotasi orbit.
 *
 * @param {{ lat: number, lng: number }} pos
 */
export function updateIssPosition(pos) {
  if (!mapInstance) return;

  const isFirstPos = !latestIssPos;
  if (latestIssPos && (latestIssPos.lat !== pos.lat || latestIssPos.lng !== pos.lng)) {
    lastKnownBearing = calculateBearing(latestIssPos.lat, latestIssPos.lng, pos.lat, pos.lng);
  }
  latestIssPos = pos;

  const latlng = [pos.lat, pos.lng];

  // Saat koordinat ISS pertama kali didapatkan, langsung arahkan layar tepat ke ISS di tengah
  // Menggunakan zoom 3 di desktop/laptop agar tidak zoomout berlebihan (menghindari duplikasi tile & lag)
  if (isFirstPos && !hasAutoCentered && typeof window !== 'undefined') {
    hasAutoCentered = true;
    if (typeof mapInstance.setView === 'function') {
      const isMobile = window.innerWidth <= 768;
      const initialZoom = isMobile ? 2.5 : 3;
      mapInstance.setView(latlng, initialZoom);
    }
  }

  if (!issMarker) {
    issMarker = window.L.marker(latlng, {
      icon: createIssIcon(lastKnownBearing, currentDifficulty !== 'expert'),
      zIndexOffset: 1000,
    }).addTo(mapInstance);
    lastRenderedBearing = lastKnownBearing;
    issMarker.bindTooltip('ISS (Sedang Mengorbit)', {
      direction: 'top',
      offset: [0, -16],
      opacity: 0.9,
    });
  } else {
    issMarker.setLatLng(latlng);
    // Hanya perbarui icon jika rotasi/bearing berubah signifikan (>= 1 derajat) agar tidak memicu lag DOM
    if (lastRenderedBearing === null || Math.abs(lastKnownBearing - lastRenderedBearing) >= 1) {
      lastRenderedBearing = lastKnownBearing;
      issMarker.setIcon(createIssIcon(lastKnownBearing, currentDifficulty !== 'expert'));
    }
  }

  // Otomatis sambungkan ujung terdepan jejak ke posisi baru ISS
  if (lastTrailPoints.length > 0 && currentDifficulty !== 'expert') {
    renderTrailLines(lastTrailPoints);
  }

  // Perbarui garis perkiraan arah jika mode latihan atau mudah sedang aktif
  if (isPracticeGuideActive || currentDifficulty === 'easy') {
    renderPracticeProjection(pos, lastKnownBearing);
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

  if (currentDifficulty === 'expert') return;
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
      draggable: true,
    }).addTo(mapInstance);

    guessMarker.on('dragend', (e) => {
      // Abaikan event drag jika drag sedang dinonaktifkan
      if (guessMarker && guessMarker.dragging && !guessMarker.dragging.enabled()) {
        return;
      }
      const pos = e.target.getLatLng();
      const clampedLat = Math.max(-90, Math.min(90, pos.lat));
      if (onMapClickCallback) {
        onMapClickCallback({
          lat: Number(clampedLat.toFixed(4)),
          lng: Number(pos.lng.toFixed(4)),
        });
      }
    });
  } else {
    guessMarker.setLatLng(latlng);
    if (guessMarker.dragging && !guessMarker.dragging.enabled()) {
      guessMarker.dragging.enable();
    }
    const markerEl = guessMarker.getElement();
    if (markerEl) {
      markerEl.style.cursor = 'pointer';
    }
  }
}

/**
 * Menampilkan hasil ronde: penanda jawaban dan garis putus-putus ke tebakan,
 * lalu menyesuaikan batas pandang peta (fitBounds) secara fungsional.
 * Menghormati prefers-reduced-motion untuk animasi garis.
 *
 * @param {{ lat: number, lng: number }} guessCoords
 * @param {{ lat: number, lng: number }} answerCoords
 * @param {number} [horizonSeconds=600]
 */
export function showRoundResult(guessCoords, answerCoords, horizonSeconds = 600) {
  if (!mapInstance) return;

  // Sesuaikan longitude visual jawaban agar berada pada kelipatan dunia terdekat dengan tebakan pemain.
  // Mencegah titik melompat ke ujung kiri peta saat melintasi garis batas antimeridian Pasifik (180°/-180°).
  const visualAnswerLng = adjustRelativeLng(answerCoords.lng, guessCoords.lng);
  const visualAnswer = { lat: answerCoords.lat, lng: visualAnswerLng };

  // Pastikan penanda tebakan terpasang, kunci drag saat review, dan beri tooltip
  setGuessMarker(guessCoords);
  if (guessMarker) {
    if (guessMarker.dragging) {
      guessMarker.dragging.disable();
    }
    const markerEl = guessMarker.getElement();
    if (markerEl) {
      markerEl.style.cursor = 'default';
    }
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

  const minutes = Math.round(Number(horizonSeconds || 600) / 60);
  answerMarker.bindTooltip(`Posisi Sebenarnya (+${minutes} Menit)`, {
    permanent: true,
    direction: 'bottom',
    offset: [0, 12],
    opacity: 0.95,
  });

  // Garis penghubung putus-putus langsung antara tebakan dan jawaban
  if (connectionLine) {
    mapInstance.removeLayer(connectionLine);
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
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
  } else {
    // Reveal animasi garis tumbuh dari tebakan menuju jawaban
    const duration = 600;
    const startTime = performance.now();

    connectionLine = window.L.polyline(
      [
        [guessCoords.lat, guessCoords.lng],
        [guessCoords.lat, guessCoords.lng],
      ],
      {
        color: 'var(--accent)',
        weight: 2.5,
        dashArray: '5, 8',
        opacity: 0.95,
      },
    ).addTo(mapInstance);

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const currentLat = guessCoords.lat + (visualAnswer.lat - guessCoords.lat) * progress;
      const currentLng = guessCoords.lng + (visualAnswer.lng - guessCoords.lng) * progress;
      if (connectionLine) {
        connectionLine.setLatLngs([
          [guessCoords.lat, guessCoords.lng],
          [currentLat, currentLng],
        ]);
      }
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

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

/**
 * Menghancurkan seluruh instance Leaflet dan membersihkan semua layer/penanda.
 */
export function destroyMap() {
  if (mapInstance) {
    try {
      mapInstance.remove();
    } catch {
      // abaikan error jika peta sudah dilepas
    }
    mapInstance = null;
    tileLayer = null;
    issMarker = null;
    guessMarker = null;
    answerMarker = null;
    connectionLine = null;
    issTrailLayer = null;
    practiceLayer = null;
    latestIssPos = null;
    lastTrailPoints = [];
    hasAutoCentered = false;
    lastRenderedBearing = null;
  }
}

/**
 * Menghitung titik tujuan pada bola bumi berdasarkan koordinat awal, bearing, dan jarak.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} bearingDeg
 * @param {number} distanceKm
 * @returns {{ lat: number, lng: number }}
 */
export function calculateDestinationPoint(lat, lng, bearingDeg, distanceKm) {
  const R = 6371;
  const delta = distanceKm / R;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  const resLat = (phi2 * 180) / Math.PI;
  let resLng = (lambda2 * 180) / Math.PI;
  resLng = normalizeLng(resLng);

  return {
    lat: Number(resLat.toFixed(4)),
    lng: Number(resLng.toFixed(4)),
  };
}

function renderPracticeProjection(pos, bearing) {
  if (!mapInstance || !practiceLayer) return;
  practiceLayer.clearLayers();

  const points = [];
  const totalKm = 4600; // Jarak tempuh perkiraan ~10 menit
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const km = (totalKm / steps) * i;
    points.push(calculateDestinationPoint(pos.lat, pos.lng, bearing, km));
  }

  const segments = splitAntimeridianSegments(points);
  for (const seg of segments) {
    if (seg.length >= 2) {
      window.L.polyline(seg, {
        color: 'var(--accent)',
        weight: 2.5,
        dashArray: '6, 8',
        opacity: 0.85,
        lineCap: 'round',
      }).addTo(practiceLayer);
    }
  }
}

/**
 * Mengaktifkan atau menonaktifkan alat bantu garis putus-putus perkiraan arah orbit pada mode latihan.
 *
 * @param {boolean} enable
 */
export function enablePracticeGuide(enable = true) {
  isPracticeGuideActive = Boolean(enable);
  if (!isPracticeGuideActive) {
    if (practiceLayer) practiceLayer.clearLayers();
  } else if (latestIssPos) {
    renderPracticeProjection(latestIssPos, lastKnownBearing);
  }
}

/**
 * Membersihkan alat bantu perkiraan arah latihan dari peta.
 */
export function clearPracticeGuide() {
  enablePracticeGuide(false);
}
