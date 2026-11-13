/**
 * ISS Hunter — Store
 * Satu sumber kebenaran (single source of truth) untuk state aplikasi.
 */

const PROFILE_CACHE_KEY = 'iss_cache_profile';

const state = {
  isConfigured: false,
  user: null,
  token: null,
  player: null,
  stats: null,
  profileRequired: false,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.error('Error pada listener store:', err);
    }
  }
}

export function setConfigured(configured) {
  state.isConfigured = Boolean(configured);
  notify();
}

export function setAuthSession(user, token) {
  state.user = user;
  state.token = token;
  notify();
}

export function setPlayerData(player, stats) {
  state.player = player;
  state.stats = stats;
  state.profileRequired = false;

  // Simpan salinan ke localStorage untuk tampilan cepat
  if (player) {
    try {
      localStorage.setItem(
        PROFILE_CACHE_KEY,
        JSON.stringify({ player, stats, cachedAt: Date.now() }),
      );
    } catch {
      // Abaikan jika localStorage dibatasi
    }
  }
  notify();
}

export function setProfileRequired(required) {
  state.profileRequired = Boolean(required);
  notify();
}

export function loadProfileCache() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearProfileCache() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // Abaikan jika localStorage dibatasi
  }
}

export function resetStore() {
  state.user = null;
  state.token = null;
  state.player = null;
  state.stats = null;
  state.profileRequired = false;
  clearProfileCache();
  notify();
}
