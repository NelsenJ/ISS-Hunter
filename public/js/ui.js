/**
 * ISS Hunter — UI Renderer (Slim)
 * Versi sederhana: login, peta, 3 tab (Permainan/Peringkat/Profil), legenda peta.
 * Tidak ada tutorial, practice mode, difficulty, atau horizon selector.
 * Horizon dikunci 600 detik (10 menit), difficulty dikunci 'normal'.
 */

import {
  getState,
  resetStore,
  setActiveRound,
  setDraftGuess,
  clearDraftGuess,
  setRoundStatus,
  loadSavedDraftGuess,
  setLeaderboardData,
  loadLeaderboardCache,
  setLeaderboardType,
} from './store.js';
import { signIn, signUp, signOut } from './auth.js';
import {
  createProfile,
  getMe,
  startRound,
  submitGuess,
  getLeaderboard,
} from './api.js';
import {
  initMap,
  setMapTheme,
  updateIssPosition,
  updateIssTrail,
  setGuessMarker,
  showRoundResult,
  clearRoundResult,
  destroyMap,
} from './map.js';
import {
  startIssPolling,
  stopIssPolling,
  fetchIssTrail,
  fetchCurrentIssPosition,
  setOnTrailUpdate,
} from './iss.js';
import { getPreferredTheme } from './theme.js';

const HORIZON_SECONDS = 600; // 10 menit — tetap

let appContainer = null;
let headerPlayerEl = null;
let headerProgressFillEl = null;
let authMode = 'login'; // 'login' | 'register' | 'profile'
let mapInitialized = false;
let countdownTimer = null;
let activeTab = 'round'; // 'round' | 'leaderboard' | 'stats'

function startCountdownTimer(startedAt) {
  if (countdownTimer) return;
  countdownTimer = setInterval(() => {
    const el = document.getElementById('countdown-timer-value');
    const text = formatRemainingTime(startedAt);
    if (el) el.textContent = text;
    if (text === '00:00') {
      stopCountdownTimer();
      setRoundStatus('idle', null, 'Ronde sudah kedaluwarsa. Mulai ronde baru.');
    }
  }, 1000);
}

function stopCountdownTimer() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

export function initUI(container) {
  appContainer = container;
  headerPlayerEl = document.getElementById('header-player-info');
  headerProgressFillEl = document.getElementById('header-progress-fill');

  // Keyboard: Esc hapus tebakan, Enter kunci tebakan
  document.addEventListener('keydown', (e) => {
    const state = getState();
    if (!state.token || !state.player) return;
    if (e.key === 'Escape' && state.roundStatus === 'active') {
      clearDraftGuess();
      setGuessMarker(null);
    } else if (e.key === 'Enter' && state.draftGuess && state.activeRound && state.roundStatus === 'active') {
      lockGuessAction();
    }
  });

  // Pantau pergantian tema
  const observer = new MutationObserver(() => {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    setMapTheme(theme);
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

export function render(state = getState()) {
  if (!appContainer) return;
  renderHeader(state);

  if (!state.token || !state.player || state.profileRequired) {
    mapInitialized = false;
    stopCountdownTimer();
    stopIssPolling();
    destroyMap();
    renderAuthScreen(state);
    return;
  }

  if (state.roundStatus !== 'active') {
    stopCountdownTimer();
  }

  renderGameScreen(state);
}

// ─── Header ─────────────────────────────────────────────────────────────────

function renderHeader(state) {
  if (!headerPlayerEl) return;
  headerPlayerEl.replaceChildren();

  if (state.player) {
    const level = state.stats?.level ?? 1;
    const progress = state.stats?.progress ?? 0;
    const progressMax = state.stats?.progressMax || 2000;
    const pct = Math.min(100, Math.max(0, (progress / progressMax) * 100));

    const nameEl = document.createElement('span');
    nameEl.className = 'player-name';
    nameEl.style.cssText = 'font-size:var(--text-sm);font-weight:500';
    nameEl.textContent = state.player.displayName;

    const levelEl = document.createElement('span');
    levelEl.className = 'tag tag-accent tabular';
    levelEl.textContent = `Lv. ${level}`;

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn btn-ghost';
    logoutBtn.style.padding = '0 var(--space-2)';
    logoutBtn.textContent = 'Keluar';
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      stopIssPolling();
      destroyMap();
      stopCountdownTimer();
      try { await signOut(); } finally { resetStore(); }
    });

    headerPlayerEl.append(nameEl, levelEl, logoutBtn);
    if (headerProgressFillEl) headerProgressFillEl.style.width = `${pct}%`;
  } else {
    if (headerProgressFillEl) headerProgressFillEl.style.width = '0%';
  }
}

// ─── Auth Screen ─────────────────────────────────────────────────────────────

function renderAuthScreen(state) {
  appContainer.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'auth-container';
  const card = document.createElement('div');
  card.className = 'auth-card';
  const header = document.createElement('div');
  header.className = 'auth-header';

  const title = document.createElement('h1');
  const description = document.createElement('p');
  description.className = 'auth-description';

  if (state.profileRequired || authMode === 'profile') {
    title.textContent = 'Nama Tampilan';
    description.textContent = 'Pilih nama tampilan untuk melihat skor dan posisi di leaderboard.';
  } else if (authMode === 'register') {
    title.textContent = 'Daftar Akun';
    description.textContent = 'Buat akun baru dengan username dan kata sandi untuk mulai bermain.';
  } else {
    title.textContent = 'Masuk';
    description.textContent = 'Masuk dengan username dan kata sandi untuk melanjutkan.';
  }

  header.append(title, description);

  const form = document.createElement('form');
  form.noValidate = true;

  const errorBox = document.createElement('div');
  errorBox.className = 'form-error';
  errorBox.style.cssText = 'display:none;margin-bottom:var(--space-3);color:var(--danger);font-size:var(--text-sm)';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.style.width = '100%';

  if (state.profileRequired || authMode === 'profile') {
    // ── Form Profil ──
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label';
    nameLabel.textContent = 'Nama Tampilan (3–20 karakter)';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input';
    nameInput.placeholder = 'cth: astronot123';
    nameInput.minLength = 3;
    nameInput.maxLength = 20;
    nameInput.required = true;
    nameInput.autocomplete = 'nickname';

    const nameHint = document.createElement('span');
    nameHint.className = 'form-hint';
    nameHint.textContent = 'Nama yang akan muncul di papan peringkat';

    nameGroup.append(nameLabel, nameInput, nameHint);
    submitBtn.textContent = 'Simpan Nama';
    form.append(nameGroup, errorBox, submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.style.display = 'none';
      const name = nameInput.value.trim();
      if (name.length < 3 || name.length > 20) {
        errorBox.textContent = 'Nama harus 3–20 karakter.';
        errorBox.style.display = 'block';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Menyimpan…';
      try {
        const { token } = getState();
        await createProfile(name, token);
        const meData = await getMe(token);
        const { setPlayerData } = await import('./store.js');
        setPlayerData(meData.player, meData.stats);
      } catch (err) {
        errorBox.textContent = err.message || 'Gagal menyimpan nama.';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Simpan Nama';
      }
    });
  } else if (authMode === 'register') {
    // ── Form Register ──
    const userGroup = document.createElement('div');
    userGroup.className = 'form-group';
    const userLabel = document.createElement('label');
    userLabel.className = 'form-label';
    userLabel.textContent = 'Username (3–20 karakter)';

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.className = 'input';
    usernameInput.placeholder = 'cth: astronot123';
    usernameInput.required = true;
    usernameInput.autocomplete = 'username';
    usernameInput.minLength = 3;
    usernameInput.maxLength = 20;

    userGroup.append(userLabel, usernameInput);

    const passGroup = document.createElement('div');
    passGroup.className = 'form-group';
    const passLabel = document.createElement('label');
    passLabel.className = 'form-label';
    passLabel.textContent = 'Kata Sandi (minimal 8 karakter)';

    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.className = 'input';
    passInput.placeholder = '••••••••';
    passInput.minLength = 8;
    passInput.required = true;
    passInput.autocomplete = 'new-password';

    passGroup.append(passLabel, passInput);

    submitBtn.textContent = 'Daftar';
    form.append(userGroup, passGroup, errorBox, submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Mendaftar…';
      try {
        const result = await signUp(usernameInput.value.trim(), passInput.value);
        const { setAuthSession, setProfileRequired } = await import('./store.js');
        if (result.session) {
          setAuthSession(result.session.user, result.session.access_token);
          setProfileRequired(true);
        } else {
          errorBox.textContent = 'Periksa konfirmasi akun.';
          errorBox.style.display = 'block';
        }
      } catch (err) {
        errorBox.textContent = err.message || 'Gagal mendaftar.';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Daftar';
      }
    });
  } else {
    // ── Form Login ──
    const userGroup = document.createElement('div');
    userGroup.className = 'form-group';
    const userLabel = document.createElement('label');
    userLabel.className = 'form-label';
    userLabel.textContent = 'Username';

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.className = 'input';
    usernameInput.placeholder = 'Username';
    usernameInput.required = true;
    usernameInput.autocomplete = 'username';

    userGroup.append(userLabel, usernameInput);

    const passGroup = document.createElement('div');
    passGroup.className = 'form-group';
    const passLabel = document.createElement('label');
    passLabel.className = 'form-label';
    passLabel.textContent = 'Kata Sandi';

    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.className = 'input';
    passInput.placeholder = 'Kata sandi';
    passInput.required = true;
    passInput.autocomplete = 'current-password';

    passGroup.append(passLabel, passInput);

    submitBtn.textContent = 'Masuk';
    form.append(userGroup, passGroup, errorBox, submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Masuk…';
      try {
        const session = await signIn(usernameInput.value.trim(), passInput.value);
        const { setAuthSession } = await import('./store.js');
        setAuthSession(session.user, session.access_token);
        const meData = await getMe(session.access_token);
        const { setPlayerData, setProfileRequired } = await import('./store.js');
        if (meData.code === 'PROFILE_REQUIRED') {
          setProfileRequired(true);
        } else {
          setPlayerData(meData.player, meData.stats);
        }
      } catch (err) {
        errorBox.textContent = err.message || 'Username atau kata sandi salah.';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk';
      }
    });
  }

  // ── Footer Navigasi Mode ──
  const footer = document.createElement('div');
  footer.className = 'auth-footer';

  if (!state.profileRequired && authMode !== 'profile') {
    const toggleLink = document.createElement('a');
    toggleLink.href = '#';
    if (authMode === 'login') {
      toggleLink.textContent = 'Belum punya akun? Daftar';
      toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        authMode = 'register';
        render(state);
      });
    } else {
      toggleLink.textContent = 'Sudah punya akun? Masuk';
      toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        authMode = 'login';
        render(state);
      });
    }
    footer.append(toggleLink);
  } else {
    const cancelLink = document.createElement('a');
    cancelLink.href = '#';
    cancelLink.textContent = 'Keluar akun';
    cancelLink.addEventListener('click', async (e) => {
      e.preventDefault();
      stopIssPolling();
      destroyMap();
      stopCountdownTimer();
      await signOut();
      resetStore();
    });
    footer.append(cancelLink);
  }

  card.append(header, form, footer);
  wrapper.append(card);
  appContainer.append(wrapper);
}

// ─── Game Screen ──────────────────────────────────────────────────────────────

function renderGameScreen(state) {
  let viewport = document.getElementById('game-viewport');
  let mapContainer = document.getElementById('map-container');

  if (!viewport || !mapContainer) {
    appContainer.replaceChildren();
    viewport = document.createElement('div');
    viewport.id = 'game-viewport';
    viewport.className = 'game-viewport';
    mapContainer = document.createElement('div');
    mapContainer.id = 'map-container';
    mapContainer.className = 'map-container';
    viewport.append(mapContainer);
    appContainer.append(viewport);
  }

  // Inisialisasi peta sekali
  if (!mapInitialized && typeof window.L !== 'undefined') {
    const theme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    initMap(mapContainer, theme, (coords) => {
      if (getState().roundStatus === 'active') {
        setDraftGuess(coords);
        setGuessMarker(coords);
      }
    });

    startIssPolling((pos) => updateIssPosition(pos));
    setOnTrailUpdate((trail) => updateIssTrail(trail));

    fetchIssTrail(HORIZON_SECONDS)
      .then((trail) => updateIssTrail(trail))
      .catch((err) => console.warn('Gagal memuat jejak awal:', err.message));

    const savedDraft = state.draftGuess || loadSavedDraftGuess();
    if (state.roundStatus === 'active' && savedDraft) {
      setDraftGuess(savedDraft);
      setGuessMarker(savedDraft);
    }

    mapInitialized = true;
  }

  // Muat leaderboard jika belum ada
  if (!state.leaderboard) {
    const cached = loadLeaderboardCache();
    if (cached) setLeaderboardData(cached);
    getLeaderboard(state.leaderboardType || 'total')
      .then((data) => setLeaderboardData(data))
      .catch((err) => console.warn('Gagal memuat papan peringkat:', err.message));
  }

  renderMapLegend(viewport);
  renderDesktopPanel(viewport, state);
  renderBottomSheet(viewport, state);
}

// ─── Map Legend ───────────────────────────────────────────────────────────────

function renderMapLegend(viewport) {
  let legend = document.getElementById('map-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'map-legend';
    legend.className = 'map-legend';
    viewport.append(legend);
  }

  legend.replaceChildren();

  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = 'Legenda Peta';

  const items = [
    { type: 'iss', label: 'ISS (Live)' },
    { type: 'trail', label: 'Jejak Orbit (10 menit)' },
    { type: 'guess', label: 'Tebakanmu' },
    { type: 'answer', label: 'Posisi Sebenarnya' },
  ];

  const list = document.createElement('div');
  list.className = 'legend-list';

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'legend-item';
    const icon = document.createElement('span');
    icon.className = `legend-icon legend-icon-${item.type}`;
    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = item.label;
    row.append(icon, label);
    list.append(row);
  }

  legend.append(title, list);
}

// ─── Desktop Side Panel ───────────────────────────────────────────────────────

function renderDesktopPanel(viewport, state) {
  let panel = document.getElementById('side-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'side-panel';
    panel.className = 'side-panel';
    viewport.append(panel);
  }

  panel.replaceChildren();

  const tabHeader = createTabNavigation(activeTab, (newTab) => {
    activeTab = newTab;
    render(getState());
  });

  const panelBody = document.createElement('div');
  panelBody.className = 'side-panel-body';
  renderTabContent(panelBody, activeTab, state);

  panel.append(tabHeader, panelBody);
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function renderBottomSheet(viewport, state) {
  let sheet = document.getElementById('bottom-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'bottom-sheet';
    sheet.className = 'bottom-sheet';
    viewport.append(sheet);
  }

  const expanded = state.roundStatus === 'active' || state.roundStatus === 'result';
  sheet.dataset.state = expanded ? 'expanded' : 'collapsed';
  sheet.replaceChildren();

  const sheetHeader = document.createElement('div');
  sheetHeader.className = 'bottom-sheet-header';

  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'display:flex;flex-direction:column';

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:var(--text-sm);font-weight:600';
  const subtitleEl = document.createElement('span');
  subtitleEl.style.cssText = 'font-size:var(--text-xs);color:var(--text-secondary)';

  if (activeTab === 'round') {
    if (state.roundStatus === 'active') {
      titleEl.textContent = 'Ronde Berjalan';
      subtitleEl.textContent = 'Klik peta lalu kunci tebakan';
    } else if (state.roundStatus === 'result') {
      titleEl.textContent = 'Hasil Ronde';
      subtitleEl.textContent = 'Lihat perolehan skor dan jarak';
    } else if (state.roundStatus === 'submitting') {
      titleEl.textContent = 'Menghitung Skor';
      subtitleEl.textContent = 'Memproses tebakan di server…';
    } else {
      titleEl.textContent = 'ISS Hunter';
      subtitleEl.textContent = 'Mulai ronde untuk menebak posisi ISS';
    }
  } else if (activeTab === 'leaderboard') {
    titleEl.textContent = 'Papan Peringkat';
    subtitleEl.textContent = 'Pemain dengan skor tertinggi';
  } else {
    titleEl.textContent = 'Profil Pemain';
    subtitleEl.textContent = `${state.player?.displayName || 'Pemain'} • Statistik`;
  }

  titleWrap.append(titleEl, subtitleEl);
  sheetHeader.append(titleWrap);

  const sheetBody = document.createElement('div');
  sheetBody.className = 'bottom-sheet-body';

  const tabNav = createTabNavigation(activeTab, (newTab) => {
    activeTab = newTab;
    render(getState());
  });

  renderTabContent(sheetBody, activeTab, state);
  sheet.append(sheetHeader, tabNav, sheetBody);
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────

function createTabNavigation(currentTab, onSelect) {
  const tabHeader = document.createElement('div');
  tabHeader.className = 'tabs';
  tabHeader.style.padding = '0 var(--space-2)';

  const tabs = [
    { id: 'round', label: 'Permainan' },
    { id: 'leaderboard', label: 'Peringkat' },
    { id: 'stats', label: 'Profil' },
  ];

  for (const t of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.setAttribute('aria-selected', currentTab === t.id ? 'true' : 'false');
    btn.textContent = t.label;
    btn.addEventListener('click', () => onSelect(t.id));
    tabHeader.append(btn);
  }

  return tabHeader;
}

function renderTabContent(container, tabName, state) {
  if (tabName === 'leaderboard') {
    renderLeaderboardContent(container, state);
  } else if (tabName === 'stats') {
    renderStatsContent(container, state);
  } else {
    renderRoundContent(container, state);
  }
}

// ─── Round Tab ────────────────────────────────────────────────────────────────

function renderRoundContent(container, state) {
  if (state.roundStatus === 'submitting') {
    const box = document.createElement('div');
    box.className = 'state-box';
    const p = document.createElement('p');
    p.textContent = 'Menghitung jarak dan skor di server…';
    box.append(p);
    container.append(box);
    return;
  }

  if (state.roundStatus === 'result' && state.roundResult) {
    renderRoundResult(container, state);
    return;
  }

  if (state.roundStatus === 'active' && state.activeRound) {
    renderActiveRound(container, state);
    return;
  }

  // Idle — tampilkan tombol mulai
  const box = document.createElement('div');
  box.className = 'state-box';

  if (state.roundError) {
    const errMsg = document.createElement('p');
    errMsg.style.color = 'var(--danger)';
    errMsg.textContent = state.roundError;
    box.append(errMsg);
  } else {
    const msg = document.createElement('p');
    msg.textContent = 'Tekan Mulai untuk menebak posisi ISS 10 menit ke depan.';
    box.append(msg);
  }

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn-primary';
  startBtn.style.width = '100%';
  startBtn.style.marginTop = 'var(--space-3)';
  startBtn.textContent = 'Mulai Ronde';
  startBtn.addEventListener('click', startNewRoundAction);

  container.append(box, startBtn);
}

function renderActiveRound(container, state) {
  const roundBox = document.createElement('div');

  // Countdown
  const countdownWrap = document.createElement('div');
  countdownWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-2);margin-bottom:var(--space-1)';

  const timeLabel = document.createElement('span');
  timeLabel.className = 'stat-label';
  timeLabel.textContent = 'Sisa waktu untuk mengunci tebakan';

  const timeValue = document.createElement('span');
  timeValue.className = 'stat-value tabular';
  timeValue.id = 'countdown-timer-value';
  timeValue.textContent = formatRemainingTime(state.activeRound.startedAt);
  countdownWrap.append(timeLabel, timeValue);

  const timerNote = document.createElement('p');
  timerNote.className = 'form-hint';
  timerNote.style.cssText = 'margin-bottom:var(--space-3);line-height:1.4';
  timerNote.textContent = 'Hasil dan skor langsung dihitung setelah kamu mengunci tebakan.';

  startCountdownTimer(state.activeRound.startedAt);

  roundBox.append(countdownWrap, timerNote);

  // Guess info
  const guessInfo = document.createElement('div');
  guessInfo.className = 'panel';
  guessInfo.style.marginBottom = 'var(--space-4)';

  if (state.draftGuess) {
    const latText = state.draftGuess.lat.toFixed(4);
    const lngText = state.draftGuess.lng.toFixed(4);
    const labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.style.marginBottom = '4px';
    labelEl.textContent = 'Titik Tebakan:';
    const valEl = document.createElement('div');
    valEl.className = 'stat-value tabular';
    valEl.style.fontSize = 'var(--text-sm)';
    valEl.textContent = `${latText}°, ${lngText}°`;
    const hintEl = document.createElement('div');
    hintEl.className = 'form-hint';
    hintEl.style.marginTop = '6px';
    hintEl.textContent = 'Tekan Esc untuk membatalkan penanda';
    guessInfo.append(labelEl, valEl, hintEl);
  } else {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:var(--text-sm);color:var(--text-secondary)';
    hint.textContent = 'Klik titik di peta di mana kamu memperkirakan ISS akan berada 10 menit ke depan.';
    guessInfo.append(hint);
  }

  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = 'btn btn-primary';
  lockBtn.style.width = '100%';
  lockBtn.textContent = 'Kunci Tebakan (Enter)';
  lockBtn.disabled = !state.draftGuess;
  lockBtn.addEventListener('click', lockGuessAction);

  roundBox.append(guessInfo, lockBtn);
  container.append(roundBox);
}

function renderRoundResult(container, state) {
  const resultBox = document.createElement('div');
  resultBox.className = 'stat-list';

  const distRow = document.createElement('div');
  distRow.className = 'stat-row';
  const distLabel = document.createElement('span');
  distLabel.className = 'stat-label';
  distLabel.textContent = 'Jarak';
  const distVal = document.createElement('span');
  distVal.className = 'stat-value tabular';
  distVal.textContent = `${state.roundResult.distanceKm.toFixed(1)} km`;
  distRow.append(distLabel, distVal);

  const scoreRow = document.createElement('div');
  scoreRow.className = 'stat-row';
  const scoreLabel = document.createElement('span');
  scoreLabel.className = 'stat-label';
  scoreLabel.textContent = 'Skor Ronde';
  const scoreVal = document.createElement('span');
  scoreVal.className = 'stat-value tabular';
  const targetScore = state.roundResult.score;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced || targetScore === 0) {
    scoreVal.textContent = `${targetScore} poin`;
  } else {
    scoreVal.textContent = '0 poin';
    const dur = 800;
    const start = performance.now();
    const countUp = (now) => {
      const prog = Math.min(1, (now - start) / dur);
      scoreVal.textContent = `${Math.floor(targetScore * prog)} poin`;
      if (prog < 1) requestAnimationFrame(countUp);
      else scoreVal.textContent = `${targetScore} poin`;
    };
    requestAnimationFrame(countUp);
  }
  scoreRow.append(scoreLabel, scoreVal);

  const totalRow = document.createElement('div');
  totalRow.className = 'stat-row';
  const totalLabel = document.createElement('span');
  totalLabel.className = 'stat-label';
  totalLabel.textContent = 'Total Skor';
  const totalVal = document.createElement('span');
  totalVal.className = 'stat-value tabular';
  totalVal.textContent = `${state.roundResult.totalScore} poin`;
  totalRow.append(totalLabel, totalVal);

  resultBox.append(distRow, scoreRow, totalRow);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-primary';
  nextBtn.style.cssText = 'width:100%;margin-top:var(--space-4)';
  nextBtn.textContent = 'Mulai Ronde Baru';
  nextBtn.addEventListener('click', () => {
    clearRoundResult();
    startNewRoundAction();
  });

  container.append(resultBox, nextBtn);
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

function renderLeaderboardContent(container, state) {
  const currentType = state.leaderboardType || 'total';

  const subTabNav = document.createElement('div');
  subTabNav.style.cssText = 'display:flex;gap:var(--space-1);margin-bottom:var(--space-3);border-bottom:1px solid var(--border);padding-bottom:var(--space-2)';

  const subTabs = [
    { id: 'total', label: 'Total Skor' },
    { id: 'average', label: 'Rata-rata (Min. 5)' },
    { id: 'today', label: 'Hari Ini' },
  ];

  for (const t of subTabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${currentType === t.id ? 'btn-primary' : 'btn-ghost'}`;
    btn.style.cssText = 'padding:4px 10px;font-size:var(--text-xs)';
    btn.textContent = t.label;
    btn.addEventListener('click', async () => {
      setLeaderboardType(t.id);
      try {
        const data = await getLeaderboard(t.id);
        setLeaderboardData(data);
      } catch (err) {
        console.warn('Gagal memuat papan peringkat:', err.message);
      }
    });
    subTabNav.append(btn);
  }
  container.append(subTabNav);

  const rows = state.leaderboard;
  if (!rows || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'state-box';
    const text = document.createElement('p');
    text.textContent = currentType === 'today'
      ? 'Belum ada ronde yang diselesaikan hari ini.'
      : 'Belum ada data di papan peringkat.';
    empty.append(text);
    container.append(empty);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const table = document.createElement('table');
  table.className = 'table';

  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  const thRank = document.createElement('th');
  thRank.textContent = '#';
  thRank.style.width = '36px';
  const thName = document.createElement('th');
  thName.textContent = 'Pemain';
  const thScore = document.createElement('th');
  thScore.textContent = currentType === 'average' ? 'Rata-rata' : currentType === 'today' ? 'Skor Hari Ini' : 'Total Skor';
  thScore.style.textAlign = 'right';
  const thRounds = document.createElement('th');
  thRounds.textContent = 'Ronde';
  thRounds.style.cssText = 'text-align:right;width:55px';
  trHead.append(thRank, thName, thScore, thRounds);
  thead.append(trHead);
  table.append(thead);

  const tbody = document.createElement('tbody');
  const myName = state.player?.displayName;

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (myName && row.displayName?.toLowerCase() === myName.toLowerCase()) {
      tr.className = 'current-player';
    }
    const tdRank = document.createElement('td');
    tdRank.className = 'col-rank';
    tdRank.textContent = String(row.rank);
    const tdName = document.createElement('td');
    tdName.textContent = row.displayName;
    const tdScore = document.createElement('td');
    tdScore.className = 'col-score';
    tdScore.textContent = currentType === 'average' && row.avgScore !== null ? `${row.avgScore} pt` : String(row.totalScore);
    const tdRounds = document.createElement('td');
    tdRounds.style.cssText = 'text-align:right;color:var(--text-secondary)';
    tdRounds.textContent = String(row.roundsDone ?? 0);
    tr.append(tdRank, tdName, tdScore, tdRounds);
    tbody.append(tr);
  }

  table.append(tbody);
  wrapper.append(table);
  container.append(wrapper);
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function renderStatsContent(container, state) {
  const statList = document.createElement('div');
  statList.className = 'stat-list';

  const rows = [
    { label: 'Pemain', value: state.player.displayName },
    { label: 'Tingkat', value: `Lv. ${state.stats?.level ?? 1}` },
    { label: 'Total Skor', value: `${state.stats?.totalScore ?? 0} poin` },
    { label: 'Ronde Selesai', value: `${state.stats?.roundsDone ?? 0}` },
    {
      label: 'Jarak Terbaik',
      value: state.stats?.bestDistanceKm !== null && state.stats?.bestDistanceKm !== undefined
        ? `${Number(state.stats.bestDistanceKm).toFixed(1)} km`
        : '—',
    },
  ];

  for (const item of rows) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const lbl = document.createElement('span');
    lbl.className = 'stat-label';
    lbl.textContent = item.label;
    const val = document.createElement('span');
    val.className = 'stat-value';
    val.textContent = item.value;
    row.append(lbl, val);
    statList.append(row);
  }

  const badgeSection = document.createElement('div');
  badgeSection.style.cssText = 'margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--border-subtle)';

  const badgeTitle = document.createElement('p');
  badgeTitle.style.cssText = 'font-size:var(--text-sm);font-weight:500;color:var(--text-secondary);margin-bottom:var(--space-2)';
  badgeTitle.textContent = 'Lencana';

  const badgeContainer = document.createElement('div');
  badgeContainer.style.cssText = 'display:flex;gap:var(--space-2);flex-wrap:wrap';

  const badges = [
    { key: 'pemula', label: 'Pemula', hint: '1 ronde' },
    { key: 'navigator', label: 'Navigator', hint: '< 500 km' },
    { key: 'sniper', label: 'Sniper', hint: '< 100 km' },
  ];

  for (const b of badges) {
    const isEarned = Boolean(state.stats?.badges?.[b.key]);
    const tag = document.createElement('span');
    tag.className = isEarned ? 'tag tag-accent' : 'tag tag-dimmed';
    tag.textContent = `${b.label} (${b.hint})`;
    badgeContainer.append(tag);
  }

  badgeSection.append(badgeTitle, badgeContainer);
  container.append(statList, badgeSection);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRemainingTime(startedAt) {
  const FIVE_MIN_SEC = 300;
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const remaining = Math.max(0, FIVE_MIN_SEC - elapsed);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function startNewRoundAction() {
  const state = getState();
  if (!state.token) return;
  try {
    clearRoundResult();
    clearDraftGuess();
    const roundData = await startRound(state.token, {
      horizon_seconds: HORIZON_SECONDS,
      difficulty: 'normal',
    });
    setActiveRound(roundData);
    fetchCurrentIssPosition().then((pos) => updateIssPosition(pos)).catch(() => {});
    fetchIssTrail(HORIZON_SECONDS).then((trail) => updateIssTrail(trail)).catch(() => {});
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal memulai ronde baru.');
  }
}

async function lockGuessAction() {
  const state = getState();
  if (!state.token || !state.activeRound || !state.draftGuess) return;

  const roundId = state.activeRound.roundId;
  const coords = state.draftGuess;
  const horizonSec = state.activeRound.horizonSeconds || HORIZON_SECONDS;

  setRoundStatus('submitting');
  stopCountdownTimer();
  try {
    const result = await submitGuess(roundId, coords, state.token);
    showRoundResult(coords, { lat: result.answer.lat, lng: result.answer.lng }, horizonSec);
    setRoundStatus('result', result);
    clearDraftGuess();

    const meData = await getMe(state.token);
    const { setPlayerData } = await import('./store.js');
    setPlayerData(meData.player, meData.stats);

    getLeaderboard(state.leaderboardType || 'total')
      .then((data) => setLeaderboardData(data))
      .catch(() => {});
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal mengunci tebakan.');
  }
}
