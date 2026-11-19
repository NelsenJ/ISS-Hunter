/**
 * ISS Hunter — Store
 * Single source of truth for the application state.
 */

const PROFILE_CACHE_KEY = 'iss_cache_profile';
const LEADERBOARD_CACHE_KEY = 'iss_cache_leaderboard';
const DRAFT_GUESS_KEY = 'iss_draft_guess';
const ACTIVE_ROUND_KEY = 'iss_active_round';
const TUTORIAL_DONE_KEY = 'iss_tutorial_done';
const PREF_HORIZON_KEY = 'iss_pref_horizon';
const PREF_DIFF_KEY = 'iss_pref_diff';

function getStoredString(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function getStoredBoolean(key, fallback = false) {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return val === '1' || val === 'true';
  } catch {
    return fallback;
  }
}

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
  leaderboard: null,
  leaderboardType: 'monthly', // 'monthly' | 'weekly' | 'daily'
  preferredHorizon: getStoredString(PREF_HORIZON_KEY, 'random'),
  preferredDifficulty: getStoredString(PREF_DIFF_KEY, 'normal'),
  isPractice: false,
  practiceResult: null,
  tutorialDone: getStoredBoolean(TUTORIAL_DONE_KEY, false),
  preferredSatellite: getStoredString('iss_pref_satellite', 'iss'),
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

export function setAuthSessionWithPlayer(user, token, player, stats) {
  state.user = user;
  state.token = token;
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
      // ignore storage errors
    }
  }
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
      // ignore storage errors
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
    // ignore storage errors
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
    // ignore storage errors
  }

  notify();
}

export function setIssPosition(pos) {
  state.issPosition = pos;
  notify();
}

export function isTutorialDone() {
  return Boolean(state.tutorialDone);
}
export function setTutorialDone(done) {
  state.tutorialDone = Boolean(done);
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, state.tutorialDone ? '1' : '0');
  } catch { void 0; }
  notify();
}

export function setRoundStatus(status, result = null, error = null) {
  state.roundStatus = status;
  if (result) state.roundResult = result;
  if (error) state.roundError = error;
  notify();
}

export function setLeaderboardData(data) {
  state.leaderboard = data;
  try {
    if (data) {
      localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // ignore storage errors
  }
  notify();
}

export function loadLeaderboardCache() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
    // Discard if older than 5 min
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
  } catch { void 0; }
}

export function clearDraftGuess() {
  try {
    localStorage.removeItem(DRAFT_GUESS_KEY);
    state.draftGuess = null;
    notify();
  } catch { void 0; }
}

export function resetStore() {
  state.isConfigured = false;
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
  state.leaderboard = null;
  state.isPractice = false;
  state.practiceResult = null;
  try {
    localStorage.removeItem(ACTIVE_ROUND_KEY);
    localStorage.removeItem(DRAFT_GUESS_KEY);
  } catch { void 0; }
  notify();
}

export function setPracticeMode(active) {
  state.isPractice = Boolean(active);
  if (!active) state.practiceResult = null;
  notify();
}

export function setPracticeResult(result) {
  state.practiceResult = result;
  notify();
}

export function setPreferredHorizon(horizon) {
  const val = horizon === 'random' ? 'random' : (Number(horizon) || 600);
  state.preferredHorizon = val;
  try {
    localStorage.setItem(PREF_HORIZON_KEY, String(val));
  } catch { void 0; }
  notify();
}

export function setPreferredDifficulty(diff) {
  state.preferredDifficulty = diff || 'normal';
  try {
    localStorage.setItem(PREF_DIFF_KEY, state.preferredDifficulty);
  } catch { void 0; }
  notify();
}

export function setLeaderboardType(type) {
  state.leaderboardType = type || 'monthly';
  notify();
}

export function setPreferredSatellite(name) {
  state.preferredSatellite = name || 'iss';
  try {
    localStorage.setItem('iss_pref_satellite', state.preferredSatellite);
  } catch { void 0; }
  notify();
}
