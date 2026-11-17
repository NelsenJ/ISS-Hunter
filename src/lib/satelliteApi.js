// Satellite API abstraction for additional satellites (Tiangong, Hubble, etc.)
// Uses CelesTrak TLE data and satellite.js for propagation.
// NOTE: Requires "satellite.js" dependency.

import { AppError } from './errors.js';

// Mapping of satellite name to NORAD catalog ID
const SAT_ID_MAP = {
  iss: 25544, // existing ISS (fallback to existing issApi if preferred)
  tiangong: 48274,
  hubble: 20580,
};

let customFetchFn = null;
/** Set custom fetch function (for unit tests) */
export function setSatelliteFetchFn(fn) {
  customFetchFn = fn;
}
function getFetchFn() {
  return customFetchFn || fetch;
}

/** Fetch TLE data from CelesTrak for a given satellite name */
export async function fetchSatelliteTle(name) {
  const satId = SAT_ID_MAP[name?.toLowerCase()];
  if (!satId) {
    throw AppError.badRequest(`Satellite "${name}" tidak dikenali.`, 'UNKNOWN_SATELLITE');
  }
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satId}&FORMAT=tle`;
  const resp = await getFetchFn()(url);
  if (!resp.ok) {
    throw AppError.badGateway('Gagal mengambil TLE dari CelesTrak.', 'UPSTREAM_ERROR');
  }
  const tleText = await resp.text();
  // TLE text contains two lines separated by newline (may have a name line)
  const lines = tleText.trim().split(/\r?\n/).filter((l) => l.trim().length);
  // If three lines (name + two lines), discard first line
  const tleLines = lines.length === 3 ? lines.slice(1) : lines;
  if (tleLines.length < 2) {
    throw AppError.badGateway('TLE tidak valid.', 'UPSTREAM_ERROR');
  }
  return { line1: tleLines[0].trim(), line2: tleLines[1].trim() };
}

/** Calculate position (lat, lng, altitude, timestamp) for a satellite at a given timestamp */
export async function calculateSatellitePosition(name, timestampMs) {
  const { line1, line2 } = await fetchSatelliteTle(name);
  // Lazy load satellite.js to avoid adding import at top (optional)
  const satellite = await import('satellite.js');
  const satrec = satellite.twoline2satrec(line1, line2);
  const date = new Date(timestampMs);
  const positionAndVelocity = satellite.propagate(satrec, date);
  if (!positionAndVelocity.position) {
    throw AppError.badGateway('Propagasi satelit gagal.', 'PROPAGATION_ERROR');
  }
  const gmst = satellite.gstime(date);
  const geodetic = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
  const latitude = satellite.degreesLat(geodetic.latitude);
  const longitude = satellite.degreesLong(geodetic.longitude);
  const altitude = geodetic.height; // km above Earth's surface
  return {
    latitude,
    longitude,
    altitude,
    timestamp: Math.floor(timestampMs / 1000),
  };
}

/** Compute trail positions for the past horizonSeconds (similar to ISS trail) */
export async function getSatelliteTrail(name, horizonSeconds = 600) {
  const nowMs = Date.now();
  const intervalMs = Math.max(1000, Math.floor((horizonSeconds * 1000) / 10));
  const positions = [];
  for (let i = 9; i >= 0; i--) {
    const ts = nowMs - i * intervalMs;
  
    const pos = await calculateSatellitePosition(name, ts);
    positions.push(pos);
  }
  return positions;
}

