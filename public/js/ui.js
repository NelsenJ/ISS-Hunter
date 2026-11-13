/**
 * ISS Hunter — UI Renderer
 * Mengatur antarmuka pengguna: auth screen, game viewport, desktop panel,
 * mobile bottom sheet, timer hitung mundur, leaderboard, dan integrasi peta.
 * Seluruh teks pengguna dirender dengan textContent untuk mencegah XSS.
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
} from './store.js';
import { signIn, signUp, signOut } from './auth.js';
import { createProfile, getMe, startRound, submitGuess, getLeaderboard } from './api.js';
import {
  initMap,
  setMapTheme,
  updateIssPosition,
  updateIssTrail,
  setGuessMarker,
  showRoundResult,
  clearRoundResult,
} from './map.js';
import { startIssPolling, fetchIssTrail } from './iss.js';
import { getPreferredTheme } from './theme.js';

let appContainer = null;
let headerPlayerEl = null;
let headerProgressFillEl = null;
let authMode = 'login'; // 'login' | 'register' | 'profile'
let mapInitialized = false;
let countdownTimer = null;
let activeTab = 'round'; // 'round' | 'leaderboard' | 'stats'
let bottomSheetExpanded = false;

export function initUI(container) {
  appContainer = container;
  headerPlayerEl = document.getElementById('header-player-info');
  headerProgressFillEl = document.getElementById('header-progress-fill');

  // Pasang keyboard listener global: Esc menghapus tebakan, Enter mengunci
  document.addEventListener('keydown', (e) => {
    const state = getState();
    if (!state.token || !state.player || state.roundStatus !== 'active') return;

    if (e.key === 'Escape') {
      clearDraftGuess();
      setGuessMarker(null);
    } else if (e.key === 'Enter') {
      if (state.draftGuess && state.activeRound) {
        lockGuessAction();
      }
    }
  });

  // Pantau perubahan tema untuk menyesuaikan peta dasar
  const observer = new MutationObserver(() => {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    setMapTheme(theme);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

export function render(state = getState()) {
  if (!appContainer) return;

  renderHeader(state);

  // Jika belum login atau profil wajib dibuat
  if (!state.token || !state.player || state.profileRequired) {
    mapInitialized = false;
    if (countdownTimer) clearInterval(countdownTimer);
    renderAuthScreen(state);
    return;
  }

  // Jika sudah login dan memiliki profil
  renderGameScreen(state);
}

function renderHeader(state) {
  if (!headerPlayerEl) return;
  headerPlayerEl.replaceChildren();

  if (state.player) {
    const level = state.stats?.level ?? 1;
    const progress = state.stats?.progress ?? 0;
    const progressPercent = Math.min(100, Math.max(0, (progress / 2000) * 100));

    const nameEl = document.createElement('span');
    nameEl.className = 'player-name';
    nameEl.style.fontSize = 'var(--text-sm)';
    nameEl.style.fontWeight = '500';
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
      try {
        await signOut();
      } finally {
        resetStore();
      }
    });

    headerPlayerEl.append(nameEl, levelEl, logoutBtn);

    if (headerProgressFillEl) {
      headerProgressFillEl.style.width = `${progressPercent}%`;
    }
  } else {
    if (headerProgressFillEl) {
      headerProgressFillEl.style.width = '0%';
    }
  }
}

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
    description.textContent = 'Buat akun untuk menebak posisi ISS dan mengumpulkan skor.';
  } else {
    title.textContent = 'Masuk';
    description.textContent = 'Masuk untuk melanjutkan permainan dan melihat skor.';
  }

  header.append(title, description);

  const form = document.createElement('form');
  form.noValidate = true;

  const formErrorEl = document.createElement('div');
  formErrorEl.className = 'form-error';
  formErrorEl.style.marginBottom = 'var(--space-3)';

  let emailInput = null;
  let passwordInput = null;

  if (!state.profileRequired && authMode !== 'profile') {
    const emailGroup = document.createElement('div');
    emailGroup.className = 'form-group';
    const emailLabel = document.createElement('label');
    emailLabel.className = 'form-label';
    emailLabel.textContent = 'Email';
    emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.className = 'input';
    emailInput.required = true;
    emailInput.autocomplete = 'username';
    emailGroup.append(emailLabel, emailInput);

    const passGroup = document.createElement('div');
    passGroup.className = 'form-group';
    const passLabel = document.createElement('label');
    passLabel.className = 'form-label';
    passLabel.textContent = 'Kata Sandi';
    passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.className = 'input';
    passwordInput.required = true;
    passwordInput.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
    passGroup.append(passLabel, passwordInput);

    form.append(emailGroup, passGroup);
  }

  let nameInput = null;
  let nameHint = null;

  if (state.profileRequired || authMode === 'register' || authMode === 'profile') {
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label';
    nameLabel.textContent = 'Nama Tampilan (3–20 karakter)';

    nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input';
    nameInput.maxLength = 20;
    nameInput.required = true;
    nameInput.autocomplete = 'nickname';

    nameHint = document.createElement('span');
    nameHint.className = 'form-hint tabular';
    nameHint.textContent = '0/20 karakter';

    nameInput.addEventListener('input', () => {
      const len = nameInput.value.trim().length;
      nameHint.textContent = `${len}/20 karakter`;
      if (len > 0 && (len < 3 || len > 20)) {
        nameHint.style.color = 'var(--danger)';
        submitBtn.disabled = true;
      } else {
        nameHint.style.color = 'var(--text-secondary)';
        submitBtn.disabled = false;
      }
    });

    nameGroup.append(nameLabel, nameInput, nameHint);
    form.append(nameGroup);
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.style.width = '100%';
  submitBtn.style.marginTop = 'var(--space-2)';

  if (state.profileRequired || authMode === 'profile') {
    submitBtn.textContent = 'Simpan Nama Tampilan';
  } else if (authMode === 'register') {
    submitBtn.textContent = 'Daftar';
  } else {
    submitBtn.textContent = 'Masuk';
  }

  form.append(formErrorEl, submitBtn);

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
      await signOut();
      resetStore();
    });
    footer.append(cancelLink);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formErrorEl.textContent = '';
    submitBtn.disabled = true;

    try {
      if (state.profileRequired || authMode === 'profile') {
        const displayName = nameInput?.value.trim() ?? '';
        if (displayName.length < 3 || displayName.length > 20) {
          formErrorEl.textContent = 'Nama tampilan harus antara 3 dan 20 karakter.';
          submitBtn.disabled = false;
          return;
        }

        const token = state.token;
        await createProfile(displayName, token);
        const meData = await getMe(token);
        import('./store.js').then(({ setPlayerData }) => {
          setPlayerData(meData.player, meData.stats);
        });
        return;
      }

      const email = emailInput?.value.trim() ?? '';
      const password = passwordInput?.value ?? '';

      if (!email || !password) {
        formErrorEl.textContent = 'Email dan kata sandi wajib diisi.';
        submitBtn.disabled = false;
        return;
      }

      if (authMode === 'register') {
        const displayName = nameInput?.value.trim() ?? '';
        if (displayName.length < 3 || displayName.length > 20) {
          formErrorEl.textContent = 'Nama tampilan harus antara 3 dan 20 karakter.';
          submitBtn.disabled = false;
          return;
        }

        const data = await signUp(email, password);
        const token = data.session?.access_token;

        if (token) {
          await createProfile(displayName, token);
          const meData = await getMe(token);
          import('./store.js').then(({ setAuthSession, setPlayerData }) => {
            setAuthSession(data.user, token);
            setPlayerData(meData.player, meData.stats);
          });
        } else {
          formErrorEl.textContent = 'Akun berhasil dibuat. Silakan masuk.';
          authMode = 'login';
          render(state);
        }
      } else {
        const data = await signIn(email, password);
        const token = data.session?.access_token;
        if (!token) throw new Error('Gagal mendapatkan token sesi.');

        try {
          const meData = await getMe(token);
          import('./store.js').then(({ setAuthSession, setPlayerData }) => {
            setAuthSession(data.user, token);
            setPlayerData(meData.player, meData.stats);
          });
        } catch (err) {
          if (err.code === 'PROFILE_REQUIRED' || err.status === 404) {
            import('./store.js').then(({ setAuthSession, setProfileRequired }) => {
              setAuthSession(data.user, token);
              setProfileRequired(true);
            });
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      if (err.code === 'NAME_TAKEN' || err.status === 409) {
        formErrorEl.textContent = 'Nama tampilan sudah dipakai. Pilih nama lain.';
      } else if (err.status === 400) {
        formErrorEl.textContent = err.message || 'Input tidak valid.';
      } else {
        formErrorEl.textContent = err.message || 'Terjadi kesalahan. Coba lagi.';
      }
    } finally {
      submitBtn.disabled = false;
    }
  });

  card.append(header, form, footer);
  wrapper.append(card);
  appContainer.append(wrapper);
}

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
      const currentState = getState();
      if (currentState.roundStatus === 'active') {
        setDraftGuess(coords);
        setGuessMarker(coords);
      }
    });

    startIssPolling((pos) => {
      updateIssPosition(pos);
    });

    fetchIssTrail()
      .then((trail) => updateIssTrail(trail))
      .catch((err) => console.warn('Gagal memuat jejak:', err.message));

    const savedDraft = loadSavedDraftGuess();
    if (savedDraft) {
      setDraftGuess(savedDraft);
      setGuessMarker(savedDraft);
    }

    mapInitialized = true;
  }

  // Ambil leaderboard jika belum ada
  if (!state.leaderboard) {
    const cachedLb = loadLeaderboardCache();
    if (cachedLb) setLeaderboardData(cachedLb);

    getLeaderboard()
      .then((data) => setLeaderboardData(data))
      .catch((err) => console.warn('Gagal memuat papan peringkat:', err.message));
  }

  renderDesktopPanel(viewport, state);
  renderBottomSheet(viewport, state);
}

function renderDesktopPanel(viewport, state) {
  let panel = document.getElementById('side-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'side-panel';
    panel.className = 'side-panel';
    viewport.append(panel);
  }

  panel.replaceChildren();

  // Tab Header: Permainan, Peringkat, Profil
  const tabHeader = document.createElement('div');
  tabHeader.className = 'tabs';
  tabHeader.style.padding = '0 var(--space-2)';

  const roundTabBtn = document.createElement('button');
  roundTabBtn.type = 'button';
  roundTabBtn.className = 'tab-btn';
  roundTabBtn.setAttribute('aria-selected', activeTab === 'round' ? 'true' : 'false');
  roundTabBtn.textContent = 'Permainan';
  roundTabBtn.addEventListener('click', () => {
    activeTab = 'round';
    render(state);
  });

  const lbTabBtn = document.createElement('button');
  lbTabBtn.type = 'button';
  lbTabBtn.className = 'tab-btn';
  lbTabBtn.setAttribute('aria-selected', activeTab === 'leaderboard' ? 'true' : 'false');
  lbTabBtn.textContent = 'Peringkat';
  lbTabBtn.addEventListener('click', () => {
    activeTab = 'leaderboard';
    render(state);
  });

  const statsTabBtn = document.createElement('button');
  statsTabBtn.type = 'button';
  statsTabBtn.className = 'tab-btn';
  statsTabBtn.setAttribute('aria-selected', activeTab === 'stats' ? 'true' : 'false');
  statsTabBtn.textContent = 'Profil';
  statsTabBtn.addEventListener('click', () => {
    activeTab = 'stats';
    render(state);
  });

  tabHeader.append(roundTabBtn, lbTabBtn, statsTabBtn);

  const panelBody = document.createElement('div');
  panelBody.className = 'side-panel-body';

  if (activeTab === 'round') {
    renderRoundContent(panelBody, state);
  } else if (activeTab === 'leaderboard') {
    renderLeaderboardContent(panelBody, state);
  } else {
    renderStatsContent(panelBody, state);
  }

  panel.append(tabHeader, panelBody);
}

function renderBottomSheet(viewport, state) {
  let sheet = document.getElementById('bottom-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'bottom-sheet';
    sheet.className = 'bottom-sheet';
    sheet.dataset.state = bottomSheetExpanded ? 'expanded' : 'collapsed';
    viewport.append(sheet);
  }

  sheet.replaceChildren();

  const sheetHeader = document.createElement('div');
  sheetHeader.className = 'bottom-sheet-header';

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.flexDirection = 'column';

  const title = document.createElement('span');
  title.style.fontSize = 'var(--text-sm)';
  title.style.fontWeight = '600';

  if (state.roundStatus === 'active') {
    title.textContent = 'Ronde Berjalan';
  } else if (state.roundStatus === 'result') {
    title.textContent = 'Hasil Ronde';
  } else {
    title.textContent = 'ISS Hunter';
  }

  const subtitle = document.createElement('span');
  subtitle.style.fontSize = 'var(--text-xs)';
  subtitle.style.color = 'var(--text-secondary)';
  subtitle.textContent =
    state.roundStatus === 'active' ? 'Klik peta lalu kunci tebakan' : 'Tekan untuk detail';

  titleWrap.append(title, subtitle);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-ghost btn-sm';
  toggleBtn.textContent = bottomSheetExpanded ? 'Tutup' : 'Buka Panel';
  toggleBtn.addEventListener('click', () => {
    bottomSheetExpanded = !bottomSheetExpanded;
    sheet.dataset.state = bottomSheetExpanded ? 'expanded' : 'collapsed';
    toggleBtn.textContent = bottomSheetExpanded ? 'Tutup' : 'Buka Panel';
  });

  sheetHeader.append(titleWrap, toggleBtn);

  const sheetBody = document.createElement('div');
  sheetBody.className = 'bottom-sheet-body';
  renderRoundContent(sheetBody, state);

  sheet.append(sheetHeader, sheetBody);
}

function renderRoundContent(container, state) {
  if (state.roundStatus === 'submitting') {
    const loadingBox = document.createElement('div');
    loadingBox.className = 'state-box';
    const skeletonLine1 = document.createElement('div');
    skeletonLine1.className = 'skeleton';
    skeletonLine1.style.width = '70%';
    skeletonLine1.style.height = '16px';
    const skeletonLine2 = document.createElement('div');
    skeletonLine2.className = 'skeleton';
    skeletonLine2.style.width = '50%';
    skeletonLine2.style.height = '12px';
    const loadingText = document.createElement('p');
    loadingText.textContent = 'Menghitung jarak dan skor di server…';
    loadingBox.append(skeletonLine1, skeletonLine2, loadingText);
    container.append(loadingBox);
    return;
  }

  if (state.roundStatus === 'result' && state.roundResult) {
    const resultBox = document.createElement('div');
    resultBox.className = 'stat-list';

    // 1. Jarak
    const distRow = document.createElement('div');
    distRow.className = 'stat-row';
    const distLabel = document.createElement('span');
    distLabel.className = 'stat-label';
    distLabel.textContent = 'Jarak';
    const distVal = document.createElement('span');
    distVal.className = 'stat-value tabular';
    distVal.textContent = `${state.roundResult.distanceKm.toFixed(1)} km`;
    distRow.append(distLabel, distVal);

    // 2. Skor ronde
    const scoreRow = document.createElement('div');
    scoreRow.className = 'stat-row';
    const scoreLabel = document.createElement('span');
    scoreLabel.className = 'stat-label';
    scoreLabel.textContent = 'Skor Ronde';
    const scoreVal = document.createElement('span');
    scoreVal.className = 'stat-value tabular';
    scoreVal.textContent = `${state.roundResult.score} poin`;
    scoreRow.append(scoreLabel, scoreVal);

    // 3. Total skor
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

    // Jika ada lencana baru
    if (state.roundResult.newBadges && state.roundResult.newBadges.length > 0) {
      const badgeBox = document.createElement('div');
      badgeBox.style.marginTop = 'var(--space-3)';
      badgeBox.style.padding = 'var(--space-2) var(--space-3)';
      badgeBox.style.border = '1px solid var(--accent)';
      badgeBox.style.borderRadius = 'var(--radius-sm)';

      const badgeHeading = document.createElement('span');
      badgeHeading.style.fontSize = 'var(--text-xs)';
      badgeHeading.style.color = 'var(--accent)';
      badgeHeading.style.fontWeight = '600';
      badgeHeading.textContent = 'Lencana Baru: ';

      const badgeList = document.createElement('span');
      badgeList.style.fontSize = 'var(--text-xs)';
      badgeList.style.fontWeight = '500';
      badgeList.textContent = state.roundResult.newBadges
        .map((b) => b.charAt(0).toUpperCase() + b.slice(1))
        .join(', ');

      badgeBox.append(badgeHeading, badgeList);
      resultBox.append(badgeBox);
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-primary';
    nextBtn.style.width = '100%';
    nextBtn.style.marginTop = 'var(--space-4)';
    nextBtn.textContent = 'Mulai Ronde Baru';
    nextBtn.addEventListener('click', () => {
      clearRoundResult();
      startNewRoundAction();
    });

    container.append(resultBox, nextBtn);
    return;
  }

  if (state.roundStatus === 'active' && state.activeRound) {
    const roundBox = document.createElement('div');

    const countdownWrap = document.createElement('div');
    countdownWrap.style.display = 'flex';
    countdownWrap.style.justifyContent = 'space-between';
    countdownWrap.style.alignItems = 'baseline';
    countdownWrap.style.marginBottom = 'var(--space-3)';

    const timeLabel = document.createElement('span');
    timeLabel.className = 'stat-label';
    timeLabel.textContent = 'Batas Kunci';

    const timeValue = document.createElement('span');
    timeValue.className = 'stat-value tabular';
    timeValue.id = 'countdown-timer-value';
    timeValue.textContent = formatRemainingTime(state.activeRound.startedAt);

    countdownWrap.append(timeLabel, timeValue);

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      const el = document.getElementById('countdown-timer-value');
      const text = formatRemainingTime(state.activeRound.startedAt);
      if (el) el.textContent = text;
      if (text === '00:00') {
        clearInterval(countdownTimer);
        setRoundStatus('idle', null, 'Ronde sudah kedaluwarsa. Mulai ronde baru.');
      }
    }, 1000);

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
      const hintText = document.createElement('div');
      hintText.style.fontSize = 'var(--text-sm)';
      hintText.style.color = 'var(--text-secondary)';
      hintText.textContent =
        'Klik titik di peta di mana kamu memperkirakan ISS akan berada 10 menit ke depan.';
      guessInfo.append(hintText);
    }

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn btn-primary';
    lockBtn.style.width = '100%';
    lockBtn.textContent = 'Kunci Tebakan (Enter)';
    lockBtn.disabled = !state.draftGuess;
    lockBtn.addEventListener('click', lockGuessAction);

    roundBox.append(countdownWrap, guessInfo, lockBtn);
    container.append(roundBox);
    return;
  }

  const emptyBox = document.createElement('div');
  emptyBox.className = 'state-box';

  if (state.roundError) {
    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'var(--danger)';
    errorMsg.textContent = state.roundError;
    emptyBox.append(errorMsg);
  } else {
    const emptyMsg = document.createElement('p');
    emptyMsg.textContent = 'Belum ada ronde berjalan. Mulai ronde untuk menebak posisi ISS.';
    emptyBox.append(emptyMsg);
  }

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn-primary';
  startBtn.style.width = '100%';
  startBtn.textContent = 'Mulai Ronde';
  startBtn.addEventListener('click', startNewRoundAction);

  container.append(emptyBox, startBtn);
}

function renderLeaderboardContent(container, state) {
  const rows = state.leaderboard;

  if (!rows || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'state-box';
    const text = document.createElement('p');
    text.textContent = 'Belum ada data pemain di papan peringkat.';
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
  thScore.textContent = 'Skor';
  thScore.style.textAlign = 'right';

  trHead.append(thRank, thName, thScore);
  thead.append(trHead);
  table.append(thead);

  const tbody = document.createElement('tbody');
  const currentDisplayName = state.player?.displayName;

  for (const row of rows) {
    const tr = document.createElement('tr');
    // Tandai baris milik pemain dengan border kiri beraksen
    if (currentDisplayName && row.displayName.toLowerCase() === currentDisplayName.toLowerCase()) {
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

    tr.append(tdRank, tdName, tdScore);
    tbody.append(tr);
  }

  table.append(tbody);
  wrapper.append(table);
  container.append(wrapper);
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
      value:
        state.stats?.bestDistanceKm !== null && state.stats?.bestDistanceKm !== undefined
          ? `${Number(state.stats.bestDistanceKm).toFixed(1)} km`
          : '—',
    },
  ];

  for (const item of rows) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = item.label;
    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = item.value;
    row.append(label, value);
    statList.append(row);
  }

  // Daftar Lencana Kontur
  const badgeSection = document.createElement('div');
  badgeSection.style.marginTop = 'var(--space-4)';
  badgeSection.style.paddingTop = 'var(--space-4)';
  badgeSection.style.borderTop = '1px solid var(--border-subtle)';

  const badgeTitle = document.createElement('p');
  badgeTitle.style.fontSize = 'var(--text-sm)';
  badgeTitle.style.fontWeight = '500';
  badgeTitle.style.color = 'var(--text-secondary)';
  badgeTitle.style.marginBottom = 'var(--space-2)';
  badgeTitle.textContent = 'Lencana';

  const badgeContainer = document.createElement('div');
  badgeContainer.style.display = 'flex';
  badgeContainer.style.gap = 'var(--space-2)';
  badgeContainer.style.flexWrap = 'wrap';

  const badgesDef = [
    { key: 'pemula', label: 'Pemula', hint: '1 ronde selesai' },
    { key: 'navigator', label: 'Navigator', hint: '< 500 km' },
    { key: 'sniper', label: 'Sniper', hint: '< 100 km' },
  ];

  for (const b of badgesDef) {
    const isEarned = Boolean(state.stats?.badges?.[b.key]);
    const tag = document.createElement('span');
    tag.className = isEarned ? 'tag tag-accent' : 'tag tag-dimmed';
    tag.textContent = `${b.label} (${b.hint})`;
    badgeContainer.append(tag);
  }

  badgeSection.append(badgeTitle, badgeContainer);
  container.append(statList, badgeSection);
}

function formatRemainingTime(startedAt) {
  const FIVE_MINUTES_SEC = 300;
  const elapsedSec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const remaining = Math.max(0, FIVE_MINUTES_SEC - elapsedSec);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function startNewRoundAction() {
  const state = getState();
  if (!state.token) return;

  try {
    const roundData = await startRound(state.token);
    setActiveRound(roundData);
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal memulai ronde baru.');
  }
}

async function lockGuessAction() {
  const state = getState();
  if (!state.token || !state.activeRound || !state.draftGuess) return;

  const roundId = state.activeRound.roundId;
  const coords = state.draftGuess;

  setRoundStatus('submitting');

  try {
    const result = await submitGuess(roundId, coords, state.token);
    showRoundResult(coords, { lat: result.answer.lat, lng: result.answer.lng });
    setRoundStatus('result', result);
    clearDraftGuess();

    // Perbarui profil dan stats pemain
    const meData = await getMe(state.token);
    import('./store.js').then(({ setPlayerData }) => {
      setPlayerData(meData.player, meData.stats);
    });

    // Refresh papan peringkat terbaru
    getLeaderboard()
      .then((data) => setLeaderboardData(data))
      .catch((err) => console.warn('Gagal memuat papan peringkat:', err.message));
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal mengunci tebakan.');
  }
}
