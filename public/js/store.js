/**
 * ISS Hunter — Store
 * Satu sumber kebenaran (single source of truth) untuk state aplikasi.
 */

const PROFILE_CACHE_KEY = 'iss_cache_profile';
const DRAFT_GUESS_KEY = 'iss_draft_guess';
const ACTIVE_ROUND_KEY = 'iss_active_round';

const state = {
  isConfigured: false,
  user: null,
  token: null,
  player: null,
  stats: null,
  profileRequired: false,
  activeRound: null,
  draftGuess: null,
  issPosition: null,
  roundStatus: 'idle', // 'idle' | 'active' | 'submitting' | 'result'
  roundResult: null,
  roundError: null,
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

export function setActiveRound(round) {
  state.activeRound = round;
  state.roundStatus = round ? 'active' : 'idle';
  state.roundError = null;

  try {
    if (round) {
      localStorage.setItem(ACTIVE_ROUND_KEY, JSON.stringify(round));
    } else {
      localStorage.removeItem(ACTIVE_ROUND_KEY);
    }
  } catch {
    // Abaikan jika storage dibatasi
  }

  notify();
}

export function setDraftGuess(coords) {
  state.draftGuess = coords;

  try {
    if (coords) {
      localStorage.setItem(DRAFT_GUESS_KEY, JSON.stringify(coords));
    } else {
      localStorage.removeItem(DRAFT_GUESS_KEY);
    }
  } catch {
    // Abaikan jika storage dibatasi
  }

  notify();
}

export function setIssPosition(pos) {
  state.issPosition = pos;
  notify();
}

export function setRoundStatus(status, result = null, error = null) {
  state.roundStatus = status;
  if (result) state.roundResult = result;
  if (error) state.roundError = error;
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

export function loadSavedDraftGuess() {
  try {
    const raw = localStorage.getItem(DRAFT_GUESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadSavedActiveRound() {
  try {
    const raw = localStorage.getItem(ACTIVE_ROUND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cek apakah masih dalam batas 5 menit
    const ageMs = Date.now() - new Date(parsed.startedAt).getTime();
    if (ageMs > 5 * 60 * 1000) {
      localStorage.removeItem(ACTIVE_ROUND_KEY);
      return null;
    }
    return parsed;
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

export function clearDraftGuess() {
  try {
    localStorage.removeItem(DRAFT_GUESS_KEY);
    state.draftGuess = null;
    notify();
  } catch {
    // Abaikan jika storage dibatasi
  }
}

export function resetStore() {
  state.user = null;
  state.token = null;
  state.player = null;
  state.stats = null;
  state.profileRequired = false;
  state.activeRound = null;
  state.draftGuess = null;
  state.issPosition = null;
  state.roundStatus = 'idle';
  state.roundResult = null;
  state.roundError = null;

  clearProfileCache();
  clearDraftGuess();
  try {
    localStorage.removeItem(ACTIVE_ROUND_KEY);
  } catch {
    // Abaikan jika storage dibatasi
  }

  notify();
}
