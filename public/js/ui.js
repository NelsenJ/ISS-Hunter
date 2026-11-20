/**
 * ISS Hunter — UI Renderer (Slim)
 * Versi sederhana: login, peta, 3 tab (Permainan/Peringkat/Profil), legenda peta.
 * Tidak ada tutorial, practice mode, difficulty, atau horizon selector.
 * Horizon dipilih acak oleh server (10–30 menit), difficulty dikunci 'normal'.
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
  setAuthSession,
  setAuthSessionWithPlayer,
  setPlayerData,
  setProfileRequired,
  isTutorialDone,
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
  normalizeLng,
  centerOnIss,
} from './map.js';
import {
  startIssPolling,
  stopIssPolling,
  fetchIssTrail,
  fetchCurrentIssPosition,
  setOnTrailUpdate,
  setTrailHorizon,
} from './iss.js';
import { getPreferredTheme } from './theme.js';
import { startInteractiveTutorial, isTutorialActive } from './tutorial.js';
import { createIcon } from './icons.js';

const DEFAULT_HORIZON_SECONDS = 600; // Nilai cadangan (10 menit)

let appContainer = null;
let headerPlayerEl = null;
let headerProgressFillEl = null;
let authMode = 'login'; // 'login' | 'register' | 'profile'
let mapInitialized = false;
let countdownTimer = null;
let activeTab = 'round'; // 'round' | 'leaderboard' | 'stats'
let sheetExpanded = true; // Terbuka secara default agar pemain HP langsung melihat kontrol permainan
let lastKnownRoundStatus = null;
let tutorialAutoStartScheduled = false;

export function setBottomSheetExpanded(expanded) {
  sheetExpanded = Boolean(expanded);
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) {
    sheet.dataset.state = sheetExpanded ? 'expanded' : 'collapsed';
    const toggleBtn = sheet.querySelector('.sheet-toggle-btn');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', sheetExpanded ? 'Tutup panel' : 'Buka panel');
      // Chevron: saat terbuka (expanded) panah menunjuk ke BAWAH (v: tutup). Saat tertutup panah menunjuk ke ATAS (^: buka).
      toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${sheetExpanded ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"></polyline></svg>`;
    }
  }
}

export function setActiveTab(tab) {
  activeTab = tab;
  render(getState());
}

export function getActiveTab() {
  return activeTab;
}

function startCountdownTimer(startedAt) {
  if (countdownTimer) return;
  countdownTimer = setInterval(() => {
    if (getState().roundStatus !== 'active') {
      stopCountdownTimer();
      return;
    }
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
    if (state.token && !state.profileRequired && !state.player) {
      // Sedang menyelaraskan data profil dari server, tunggu hingga selesai
      return;
    }
    mapInitialized = false;
    stopCountdownTimer();
    stopIssPolling();
    // Hapus bottom-sheet dari body saat user keluar/logout agar tidak ada sisa DOM
    const orphanSheet = document.getElementById('bottom-sheet');
    if (orphanSheet) orphanSheet.remove();
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

    // Garis pemisah tipis antara level dan tombol keluar
    const sep = document.createElement('span');
    sep.setAttribute('aria-hidden', 'true');
    sep.style.cssText =
      'display:inline-block;width:1px;align-self:stretch;background:var(--border-subtle);flex-shrink:0';
    headerPlayerEl.append(nameEl, levelEl, sep, logoutBtn);
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
  form.className = 'auth-form';

  const errorBox = document.createElement('div');
  errorBox.className = 'form-error';
  errorBox.style.cssText = 'display:none;margin-bottom:var(--space-2);color:var(--danger);font-size:var(--text-sm)';

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
        const { token, user } = getState();
        await createProfile(name, token);
        const meData = await getMe(token);
        setAuthSessionWithPlayer(user, token, meData.player, meData.stats);
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
        if (result?.session) {
          const meData = await getMe(result.session.access_token);
          setAuthSessionWithPlayer(
            result.session.user,
            result.session.access_token,
            meData.player,
            meData.stats,
          );
        } else {
          errorBox.textContent = 'Periksa konfirmasi akun.';
          errorBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Daftar';
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
        const meData = await getMe(session.access_token);
        if (meData.code === 'PROFILE_REQUIRED') {
          setAuthSession(session.user, session.access_token);
          setProfileRequired(true);
        } else {
          setAuthSessionWithPlayer(
            session.user,
            session.access_token,
            meData.player,
            meData.stats,
          );
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
        setGuessMarker(coords);
        setDraftGuess(coords);
      }
    });

    startIssPolling((pos) => updateIssPosition(pos));
    setOnTrailUpdate((trail) => updateIssTrail(trail));

    const activeHorizon = state.activeRound?.horizonSeconds || DEFAULT_HORIZON_SECONDS;
    setTrailHorizon(activeHorizon);
    fetchIssTrail(activeHorizon)
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
    getLeaderboard(state.leaderboardType || 'monthly')
      .then((data) => setLeaderboardData(data))
      .catch((err) => console.warn('Gagal memuat papan peringkat:', err.message));
  }

  renderMapLegend(viewport);
  renderDesktopPanel(viewport, state);
  renderBottomSheet(viewport, state);

  // Panduan otomatis untuk pemain baru (first-timer)
  const curPlayerId = state.player?.id;
  const roundsDone = Number(state.stats?.roundsDone ?? 0);
  const isFirstTimer = !isTutorialDone(curPlayerId) || (roundsDone === 0 && !isTutorialDone(curPlayerId));

  if (state.token && state.player && isFirstTimer && !isTutorialActive() && !tutorialAutoStartScheduled) {
    tutorialAutoStartScheduled = true;
    setTimeout(() => {
      tutorialAutoStartScheduled = false;
      if (!isTutorialDone(state.player?.id) && !isTutorialActive()) {
        startInteractiveTutorial();
      }
    }, 250);
  }
}

// ─── Map Legend ───────────────────────────────────────────────────────────────

function renderMapLegend(viewport) {
  let legend = document.getElementById('map-legend');
  if (legend) return;

  legend = document.createElement('div');
  legend.id = 'map-legend';
  legend.className = 'map-legend';
  viewport.append(legend);

  legend.replaceChildren();

  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = 'Legenda Peta';

  const items = [
    { type: 'iss', label: 'ISS (Live)' },
    { type: 'trail', label: 'Jejak Orbit ISS' },
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

  const guideLegendBtn = document.createElement('button');
  guideLegendBtn.type = 'button';
  guideLegendBtn.className = 'btn btn-ghost btn-sm';
  guideLegendBtn.style.cssText =
    'width:100%;margin-top:var(--space-2);font-size:var(--text-xs);padding:4px;border:1px dashed var(--border);border-radius:var(--radius-sm);display:inline-flex;align-items:center;justify-content:center;gap:6px';
  guideLegendBtn.replaceChildren(createIcon('book-open', 14), document.createTextNode('Panduan Game'));
  guideLegendBtn.addEventListener('click', () => {
    startInteractiveTutorial();
  });
  list.append(guideLegendBtn);

  legend.append(title, list);
}

// ─── Desktop Side Panel ───────────────────────────────────────────────────────

function renderDesktopPanel(viewport, state) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  if (isMobile) {
    const existing = document.getElementById('side-panel');
    if (existing) existing.remove();
    return;
  }

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
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  if (!isMobile) {
    const existing = document.getElementById('bottom-sheet');
    if (existing) existing.remove();
    return;
  }

  // Pastikan bottom-sheet selalu di-append ke document.body agar position:fixed bekerja
  // bahkan ketika parent mempunyai overflow:hidden atau transform
  let sheet = document.getElementById('bottom-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'bottom-sheet';
    sheet.className = 'bottom-sheet';
    document.body.append(sheet);
  } else if (sheet.parentElement !== document.body) {
    document.body.append(sheet);
  }

  // Sinkronkan status buka otomatis saat status ronde berubah (selalu buka agar tombol selalu tampak)
  if (lastKnownRoundStatus !== state.roundStatus) {
    sheetExpanded = true;
    lastKnownRoundStatus = state.roundStatus;
  }

  sheet.dataset.state = sheetExpanded ? 'expanded' : 'collapsed';
  sheet.replaceChildren();

  // ── Header yang bisa diklik untuk toggle ──
  const sheetHeader = document.createElement('div');
  sheetHeader.className = 'bottom-sheet-header';
  sheetHeader.setAttribute('role', 'button');
  sheetHeader.setAttribute('aria-label', 'Buka / tutup panel');

  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'display:flex;flex-direction:column;flex:1;min-width:0';

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:var(--text-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  const subtitleEl = document.createElement('span');
  subtitleEl.style.cssText = 'font-size:var(--text-xs);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

  if (activeTab === 'round') {
    if (state.roundStatus === 'active') {
      titleEl.textContent = 'Ronde Berjalan';
      subtitleEl.textContent = 'Ketuk peta • kunci tebakan';
    } else if (state.roundStatus === 'result') {
      titleEl.textContent = 'Hasil Ronde';
      subtitleEl.textContent = 'Skor dan jarak tebakanmu';
    } else if (state.roundStatus === 'submitting') {
      titleEl.textContent = 'Menghitung Skor';
      subtitleEl.textContent = 'Memproses…';
    } else {
      titleEl.textContent = 'ISS Hunter';
      subtitleEl.textContent = 'Ketuk untuk mulai';
    }
  } else if (activeTab === 'leaderboard') {
    titleEl.textContent = 'Papan Peringkat';
    subtitleEl.textContent = 'Skor tertinggi';
  } else {
    titleEl.textContent = 'Profil';
    subtitleEl.textContent = state.player?.displayName || 'Pemain';
  }

  // Tombol chevron toggle
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'sheet-toggle-btn';
  toggleBtn.setAttribute('aria-label', sheet.dataset.state === 'expanded' ? 'Tutup panel' : 'Buka panel');

  // Chevron SVG: down (v) ketika expanded (tutup), up (^) ketika collapsed (buka)
  const isExp = sheet.dataset.state === 'expanded';
  toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${isExp ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"></polyline></svg>`;

  // Toggle handler (header + tombol)
  const handleToggle = () => {
    sheetExpanded = sheet.dataset.state !== 'expanded';
    sheet.dataset.state = sheetExpanded ? 'expanded' : 'collapsed';
    // Update chevron tanpa full re-render
    const nowExp = sheetExpanded;
    toggleBtn.setAttribute('aria-label', nowExp ? 'Tutup panel' : 'Buka panel');
    toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${nowExp ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"></polyline></svg>`;
  };
  sheetHeader.addEventListener('click', handleToggle);

  titleWrap.append(titleEl, subtitleEl);
  sheetHeader.append(titleWrap, toggleBtn);

  const sheetBody = document.createElement('div');
  sheetBody.className = 'bottom-sheet-body';

  const tabNav = createTabNavigation(activeTab, (newTab) => {
    activeTab = newTab;
    sheetExpanded = true;
    render(getState());
  });

  renderTabContent(sheetBody, activeTab, state);
  sheet.append(sheetHeader, tabNav, sheetBody);
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────

function createTabNavigation(currentTab, onSelect) {
  const tabHeader = document.createElement('div');
  tabHeader.id = 'panel-tab-nav';
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

  // Idle — tampilkan tombol mulai (horizon acak otomatis oleh server)
  const box = document.createElement('div');
  box.className = 'state-box';

  if (state.roundError) {
    const errMsg = document.createElement('p');
    errMsg.style.color = 'var(--danger)';
    errMsg.textContent = state.roundError;
    box.append(errMsg);
  } else {
    const msg = document.createElement('p');
    msg.style.lineHeight = '1.4';
    msg.textContent =
      'Tebak posisi ISS di orbit Bumi. Setiap ronde memiliki target waktu acak antara 10 hingga 30 menit ke depan.';
    box.append(msg);
  }

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.id = 'start-round-btn';
  startBtn.className = 'btn btn-primary';
  startBtn.style.width = '100%';
  startBtn.style.marginTop = 'var(--space-3)';
  startBtn.textContent = 'Mulai Ronde';
  startBtn.addEventListener('click', () => startNewRoundAction(startBtn));

  container.append(box, startBtn);
}

function renderActiveRound(container, state) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const roundBox = document.createElement('div');
  roundBox.className = 'round-active-box';
  const horizonSec = state.activeRound.horizonSeconds || 600;
  const horizonMin = Math.round(horizonSec / 60);
  const distanceEst = Math.round((27600 / 60) * horizonMin);
  const orbitPct = Math.round((horizonMin / 92) * 100);

  // Kartu Target Misi (ringkas & padat di HP)
  const missionBadge = document.createElement('div');
  missionBadge.id = 'mission-target-badge';
  missionBadge.className = 'panel round-target-panel';
  missionBadge.style.cssText = isMobile
    ? 'padding:var(--space-2) var(--space-3);margin-bottom:var(--space-2);background:color-mix(in srgb, var(--accent) 8%, var(--surface));border:1px solid color-mix(in srgb, var(--accent) 25%, transparent);border-radius:var(--radius-md)'
    : 'padding:var(--space-3);margin-bottom:var(--space-3);background:color-mix(in srgb, var(--accent) 8%, var(--surface));border:1px solid color-mix(in srgb, var(--accent) 25%, transparent);border-radius:var(--radius-md)';

  if (isMobile) {
    const missionDesc = document.createElement('div');
    missionDesc.style.cssText = 'font-size:var(--text-xs);font-weight:700;color:var(--accent);line-height:1.3';
    missionDesc.textContent = `TARGET: PREDIKSI ISS +${horizonMin} MENIT`;

    const missionHint = document.createElement('div');
    missionHint.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-top:2px;line-height:1.3';
    missionHint.textContent = `Orbit: ~${distanceEst.toLocaleString('id-ID')} km (~${orbitPct}% putaran Bumi)`;

    missionBadge.append(missionDesc, missionHint);
  } else {
    const missionTitle = document.createElement('div');
    missionTitle.style.cssText =
      'font-size:var(--text-xs);font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px';
    missionTitle.textContent = 'Target Misi';

    const missionDesc = document.createElement('div');
    missionDesc.style.cssText = 'font-size:var(--text-sm);font-weight:600;color:var(--text)';
    missionDesc.textContent = `Prediksi Posisi ISS +${horizonMin} Menit Ke Depan`;

    const missionHint = document.createElement('div');
    missionHint.style.cssText = 'font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px';
    missionHint.textContent = `Jarak tempuh orbit: ~${distanceEst.toLocaleString('id-ID')} km (~${orbitPct}% satu putaran Bumi)`;

    missionBadge.append(missionTitle, missionDesc, missionHint);
  }
  roundBox.append(missionBadge);

  // Countdown
  const countdownWrap = document.createElement('div');
  countdownWrap.className = 'round-countdown-wrap';
  countdownWrap.style.cssText = isMobile
    ? 'display:flex;justify-content:space-between;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2)'
    : 'display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-2);margin-bottom:var(--space-1)';

  const timeLabel = document.createElement('span');
  timeLabel.className = 'stat-label';
  timeLabel.textContent = isMobile ? 'Sisa waktu:' : 'Sisa waktu untuk mengunci tebakan';

  const timeValue = document.createElement('span');
  timeValue.className = 'stat-value tabular';
  timeValue.id = 'countdown-timer-value';
  timeValue.textContent = formatRemainingTime(state.activeRound.startedAt);
  countdownWrap.append(timeLabel, timeValue);
  roundBox.append(countdownWrap);

  if (!isMobile) {
    const timerNote = document.createElement('p');
    timerNote.className = 'form-hint round-timer-note';
    timerNote.style.cssText = 'margin-bottom:var(--space-3);line-height:1.4';
    timerNote.textContent = 'Hasil dan skor langsung dihitung setelah kamu mengunci tebakan.';
    roundBox.append(timerNote);
  }

  startCountdownTimer(state.activeRound.startedAt);

  // Guess info
  const guessInfo = document.createElement('div');
  guessInfo.className = 'panel round-guess-panel';
  guessInfo.style.marginBottom = isMobile ? 'var(--space-2)' : 'var(--space-4)';
  if (isMobile) {
    guessInfo.style.padding = 'var(--space-2) var(--space-3)';
  }

  if (state.draftGuess) {
    const latText = state.draftGuess.lat.toFixed(4);
    const lngText = state.draftGuess.lng.toFixed(4);

    if (isMobile) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--space-2)';

      const textSpan = document.createElement('span');
      textSpan.style.cssText = 'font-size:var(--text-xs);font-weight:600;color:var(--text)';
      textSpan.textContent = `Tebakan: ${latText}°, ${lngText}°`;

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn';
      cancelBtn.style.cssText =
        'min-height:26px;height:26px;padding:0 var(--space-2);font-size:var(--text-xs);line-height:1';
      cancelBtn.textContent = 'Hapus';
      cancelBtn.addEventListener('click', () => {
        clearDraftGuess();
        setGuessMarker(null);
        render(getState());
      });

      row.append(textSpan, cancelBtn);
      guessInfo.append(row);
    } else {
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
    }
  } else {
    const hint = document.createElement('div');
    hint.style.cssText = isMobile
      ? 'font-size:var(--text-xs);color:var(--text-secondary);line-height:1.3'
      : 'font-size:var(--text-sm);color:var(--text-secondary);line-height:1.4';
    hint.textContent = isMobile
      ? `Ketuk peta pada perkiraan posisi ISS (+${horizonMin} mnt).`
      : `Klik titik di peta di mana kamu memperkirakan ISS akan berada ${horizonMin} menit ke depan.`;
    guessInfo.append(hint);
  }

  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.id = 'lock-guess-btn';
  lockBtn.className = 'btn btn-primary round-lock-btn';
  lockBtn.style.width = '100%';
  lockBtn.textContent = isMobile ? 'Kunci Tebakan' : 'Kunci Tebakan (Enter)';
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
    startNewRoundAction(nextBtn);
  });

  container.append(resultBox, nextBtn);
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

function renderLeaderboardContent(container, state) {
  const currentType = state.leaderboardType || 'monthly';

  // Segmented control: 3 kolom tersebar rapi & clean
  const subTabNav = document.createElement('div');
  subTabNav.style.cssText =
    'display:grid;grid-template-columns:repeat(3, 1fr);gap:var(--space-1);margin-bottom:var(--space-3);background:color-mix(in srgb, var(--text) 4%, var(--surface));padding:4px;border-radius:var(--radius-md);border:1px solid var(--border-subtle)';

  const subTabs = [
    { id: 'monthly', label: 'Monthly' },
    { id: 'weekly',  label: 'Weekly' },
    { id: 'daily',   label: 'Daily' },
  ];

  for (const t of subTabs) {
    const isSelected = currentType === t.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`;
    btn.style.cssText =
      'width:100%;justify-content:center;padding:6px 0;font-size:var(--text-xs);font-weight:600;text-align:center;border-radius:calc(var(--radius-md) - 2px);transition:all var(--duration-fast) var(--ease-standard)';
    btn.textContent = t.label;
    btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
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
    const emptyMessages = {
      monthly: 'Belum ada ronde yang diselesaikan bulan ini.',
      weekly:  'Belum ada ronde yang diselesaikan minggu ini.',
      daily:   'Belum ada ronde yang diselesaikan hari ini.',
    };
    text.textContent = emptyMessages[currentType] || 'Belum ada data di papan peringkat.';
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
  const scoreLabels = { monthly: 'Score (Monthly)', weekly: 'Score (Weekly)', daily: 'Score (Daily)' };
  thScore.textContent = scoreLabels[currentType] || 'Skor';
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
    tdScore.textContent = String(row.totalScore);
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

const BADGE_INFO = {
  pemula: {
    title: 'Pemula',
    desc: 'Selamat! Kamu telah menyelesaikan ronde pertamamu di ISS Hunter.',
    icon: 'rocket',
    accentColor: 'var(--accent)',
  },
  hunter: {
    title: 'Hunter',
    desc: 'Luar biasa! Tebakan akuratmu berada di bawah 1.000 km dari posisi target ISS.',
    icon: 'target',
    accentColor: 'var(--accent)',
  },
  navigator: {
    title: 'Navigator',
    desc: 'Hebat! Tebakan presisi berada di bawah 500 km dari target ISS.',
    icon: 'route',
    accentColor: 'var(--accent)',
  },
  sniper: {
    title: 'Sniper',
    desc: 'Super akurat! Tebakan sangat presisi di bawah 100 km dari posisi nyata ISS.',
    icon: 'crosshair',
    accentColor: 'var(--accent)',
  },
  skillIssue: {
    title: 'Skill Issue',
    desc: 'Waduh! Tebakan meleset lebih dari 2.000 km dari target ISS. Jangan menyerah, asah terus insting orbitmu!',
    icon: 'alert-triangle',
    accentColor: 'var(--warning, #e67e22)',
  },
};

function showNewBadgesPopup(newBadgeKeys) {
  if (!newBadgeKeys || newBadgeKeys.length === 0) return;

  const validBadges = newBadgeKeys
    .map((key) => BADGE_INFO[key])
    .filter(Boolean);

  if (validBadges.length === 0) return;

  const existing = document.getElementById('badge-popup-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'badge-popup-overlay';
  overlay.className = 'badge-popup-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'badge-popup-card';

  const closePopup = () => {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', handleKey);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      closePopup();
    }
  };
  document.addEventListener('keydown', handleKey);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup();
  });

  const header = document.createElement('div');
  header.className = 'badge-popup-header';

  const subtitle = document.createElement('span');
  subtitle.className = 'badge-popup-subtitle';
  subtitle.textContent = 'LENCANA BARU TERBUKA!';

  header.append(subtitle);

  const list = document.createElement('div');
  list.className = 'badge-popup-list';

  for (const b of validBadges) {
    const item = document.createElement('div');
    item.className = 'badge-popup-item';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'badge-popup-icon-wrap';
    if (b.accentColor) iconWrap.style.color = b.accentColor;
    iconWrap.append(createIcon(b.icon, 30));

    const content = document.createElement('div');
    content.className = 'badge-popup-content';

    const name = document.createElement('h3');
    name.className = 'badge-popup-name';
    name.textContent = b.title;

    const desc = document.createElement('p');
    desc.className = 'badge-popup-desc';
    desc.textContent = b.desc;

    content.append(name, desc);
    item.append(iconWrap, content);
    list.append(item);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.style.cssText = 'width:100%;margin-top:var(--space-4);padding:10px 0;font-weight:600';
  btn.textContent = 'Mantap!';
  btn.addEventListener('click', closePopup);

  card.append(header, list, btn);
  overlay.append(card);
  document.body.append(overlay);
  btn.focus();
}

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
    { key: 'hunter', label: 'Hunter', hint: '< 1000 km' },
    { key: 'navigator', label: 'Navigator', hint: '< 500 km' },
    { key: 'sniper', label: 'Sniper', hint: '< 100 km' },
    { key: 'skillIssue', label: 'Skill Issue', hint: '> 2000 km' },
  ];

  for (const b of badges) {
    const isEarned = Boolean(state.stats?.badges?.[b.key]);
    const info = BADGE_INFO[b.key];
    const tag = document.createElement('span');
    tag.className = isEarned ? 'tag tag-accent' : 'tag tag-dimmed';
    tag.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px';
    if (info?.icon) {
      tag.append(createIcon(info.icon, 12));
    }
    const textNode = document.createTextNode(`${b.label} (${b.hint})`);
    tag.append(textNode);
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

let isStartingRound = false;

async function startNewRoundAction(triggerBtn = null) {
  if (isStartingRound) return;
  const state = getState();
  if (!state.token) return;

  isStartingRound = true;

  // 1. Bersihkan hasil ronde lama & titik tebakan seketika
  clearRoundResult();
  clearDraftGuess();

  // 2. Langsung arahkan kamera peta ke orbit ISS sekarang tanpa jeda/menunggu respons server
  centerOnIss();

  // 3. Pasang animasi spinner loading dan status disabled pada tombol pemicu
  const targetButtons = triggerBtn
    ? [triggerBtn]
    : Array.from(document.querySelectorAll('#start-round-btn'));

  for (const btn of targetButtons) {
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.replaceChildren(
      createIcon('loader', 16, 'animate-spin'),
      document.createTextNode(' Memulai Ronde…'),
    );
  }

  try {
    // Tidak mengirim horizon_seconds — server akan memilih acak (10–30 menit)
    const roundData = await startRound(state.token, { difficulty: 'normal' });
    setActiveRound(roundData);
    const roundHorizon = roundData.horizonSeconds || DEFAULT_HORIZON_SECONDS;
    setTrailHorizon(roundHorizon);

    // Pastikan posisi dan lintasan terbaru tetap sinkron di tengah layar
    fetchCurrentIssPosition()
      .then((pos) => {
        updateIssPosition(pos);
        centerOnIss();
      })
      .catch(() => {});
    fetchIssTrail(roundHorizon)
      .then((trail) => {
        updateIssTrail(trail);
        centerOnIss();
      })
      .catch(() => {});
  } catch (err) {
    for (const btn of targetButtons) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.replaceChildren(document.createTextNode('Mulai Ronde'));
    }
    setRoundStatus('idle', null, err.message || 'Gagal memulai ronde baru.');
  } finally {
    isStartingRound = false;
  }
}

async function lockGuessAction() {
  const state = getState();
  if (!state.token || !state.activeRound || !state.draftGuess) return;

  const roundId = state.activeRound.roundId;
  const rawCoords = state.draftGuess;
  const coords = {
    lat: rawCoords.lat,
    lng: normalizeLng(rawCoords.lng),
  };
  const horizonSec = state.activeRound.horizonSeconds || DEFAULT_HORIZON_SECONDS;

  setRoundStatus('submitting');
  stopCountdownTimer();

  let result;
  try {
    result = await submitGuess(roundId, coords, state.token);
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal mengunci tebakan.');
    return;
  }

  showRoundResult(rawCoords, { lat: result.answer.lat, lng: result.answer.lng }, horizonSec);
  setRoundStatus('result', result);
  clearDraftGuess();

  // Tampilkan pop-up jika pemain mendapatkan lencana baru
  if (result.newBadges && result.newBadges.length > 0) {
    showNewBadgesPopup(result.newBadges);
  }

  // Sinkronisasi data profil dan papan peringkat di latar belakang tanpa menginterupsi hasil review
  getMe(state.token)
    .then((meData) => setPlayerData(meData.player, meData.stats))
    .catch((err) => console.warn('Gagal memperbarui profil pemain:', err.message));

  getLeaderboard(state.leaderboardType || 'monthly')
    .then((data) => setLeaderboardData(data))
    .catch(() => {});
}
