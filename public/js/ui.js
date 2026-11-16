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
  isTutorialDone,
  setPracticeMode,
  setPracticeResult,
  setPreferredHorizon,
  setPreferredDifficulty,
  setLeaderboardType,
} from './store.js';
import { signIn, signUp, signOut } from './auth.js';
import {
  createProfile,
  getMe,
  startRound,
  submitGuess,
  submitPracticeGuess,
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
  enablePracticeGuide,
  clearPracticeGuide,
  setMapDifficulty,
} from './map.js';
import { startInteractiveTutorial, isTutorialActive } from './tutorial.js';
import {
  startIssPolling,
  fetchIssTrail,
  fetchCurrentIssPosition,
  setOnTrailUpdate,
  setTrailHorizon,
} from './iss.js';
import { getPreferredTheme } from './theme.js';

let appContainer = null;
let headerPlayerEl = null;
let headerProgressFillEl = null;
let authMode = 'login'; // 'login' | 'register' | 'profile'
let mapInitialized = false;
let countdownTimer = null;
let activeTab = 'round'; // 'round' | 'leaderboard' | 'stats' | 'tutorial'
let bottomSheetExpanded = false;

export function initUI(container) {
  appContainer = container;
  headerPlayerEl = document.getElementById('header-player-info');
  headerProgressFillEl = document.getElementById('header-progress-fill');

  // Pasang keyboard listener global: Esc menghapus tebakan, Enter mengunci
  document.addEventListener('keydown', (e) => {
    const state = getState();
    if (!state.token || !state.player) return;

    if (e.key === 'Escape') {
      if (state.roundStatus === 'active' || state.isPractice) {
        clearDraftGuess();
        setGuessMarker(null);
      }
    } else if (e.key === 'Enter') {
      if (state.draftGuess && state.activeRound && state.roundStatus === 'active') {
        lockGuessAction();
      } else if (state.draftGuess && state.isPractice && !state.practiceResult) {
        lockPracticeGuessAction();
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
    const progressMax = state.stats?.progressMax || 2000;
    const progressPercent = Math.min(100, Math.max(0, (progress / progressMax) * 100));

    const nameEl = document.createElement('span');
    nameEl.className = 'player-name';
    nameEl.style.fontSize = 'var(--text-sm)';
    nameEl.style.fontWeight = '500';
    nameEl.textContent = state.player.displayName;

    const levelEl = document.createElement('span');
    levelEl.className = 'tag tag-accent tabular';
    levelEl.textContent = `Lv. ${level}`;

    const tutorialBtn = document.createElement('button');
    tutorialBtn.type = 'button';
    tutorialBtn.className = 'btn btn-ghost';
    tutorialBtn.style.padding = '0 var(--space-2)';
    tutorialBtn.textContent = 'Panduan';
    tutorialBtn.addEventListener('click', () => {
      startInteractiveTutorial({
        onStartPractice: () => {
          startPracticeAction();
        },
        onComplete: () => {
          activeTab = 'tutorial';
          bottomSheetExpanded = true;
          render(getState());
        },
      });
    });

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

    headerPlayerEl.append(nameEl, levelEl, tutorialBtn, logoutBtn);

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

  let userInput = null;
  let userHint = null;
  let passwordInput = null;
  let nameInput = null;
  let nameHint = null;

  if (state.profileRequired || authMode === 'profile') {
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
    nameInput.placeholder = 'cth: astronot123';

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
  } else {
    // Mode Login atau Register: CUKUP USERNAME DAN KATA SANDI (tanpa email)
    const userGroup = document.createElement('div');
    userGroup.className = 'form-group';
    const userLabel = document.createElement('label');
    userLabel.className = 'form-label';
    userLabel.textContent = authMode === 'register' ? 'Username (3–20 karakter)' : 'Username';

    userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.className = 'input';
    userInput.maxLength = 20;
    userInput.required = true;
    userInput.autocomplete = 'username';
    userInput.placeholder = 'cth: astronot123';

    if (authMode === 'register') {
      userHint = document.createElement('span');
      userHint.className = 'form-hint tabular';
      userHint.textContent = '0/20 karakter';

      userInput.addEventListener('input', () => {
        const len = userInput.value.trim().length;
        userHint.textContent = `${len}/20 karakter`;
        if (len > 0 && (len < 3 || len > 20)) {
          userHint.style.color = 'var(--danger)';
          submitBtn.disabled = true;
        } else {
          userHint.style.color = 'var(--text-secondary)';
          submitBtn.disabled = false;
        }
      });
      userGroup.append(userLabel, userInput, userHint);
    } else {
      userGroup.append(userLabel, userInput);
    }

    const passGroup = document.createElement('div');
    passGroup.className = 'form-group';
    const passLabel = document.createElement('label');
    passLabel.className = 'form-label';
    passLabel.textContent =
      authMode === 'register' ? 'Kata Sandi (minimal 6 karakter)' : 'Kata Sandi';
    passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.className = 'input';
    passwordInput.required = true;
    passwordInput.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
    passwordInput.placeholder = '••••••••';
    passGroup.append(passLabel, passwordInput);

    form.append(userGroup, passGroup);
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

      const username = userInput?.value.trim() ?? '';
      const password = passwordInput?.value ?? '';

      if (!username || !password) {
        formErrorEl.textContent = 'Username dan kata sandi wajib diisi.';
        submitBtn.disabled = false;
        return;
      }

      if (authMode === 'register') {
        if (username.length < 3 || username.length > 20) {
          formErrorEl.textContent = 'Username harus antara 3 dan 20 karakter.';
          submitBtn.disabled = false;
          return;
        }

        if (password.length < 6) {
          formErrorEl.textContent = 'Kata sandi minimal 6 karakter.';
          submitBtn.disabled = false;
          return;
        }

        const data = await signUp(username, password);
        const token = data.session?.access_token;

        if (token) {
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
        const data = await signIn(username, password);
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
        formErrorEl.textContent = 'Username sudah dipakai. Pilih nama lain.';
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
      if (currentState.roundStatus === 'active' || currentState.isPractice) {
        setDraftGuess(coords);
        setGuessMarker(coords);
      }
    });

    startIssPolling((pos) => {
      updateIssPosition(pos);
    });

    setOnTrailUpdate((trail) => {
      updateIssTrail(trail);
    });

    fetchIssTrail()
      .then((trail) => updateIssTrail(trail))
      .catch((err) => console.warn('Gagal memuat jejak:', err.message));

    const savedDraft = state.draftGuess || loadSavedDraftGuess();
    if ((state.roundStatus === 'active' || state.isPractice) && savedDraft) {
      setDraftGuess(savedDraft);
      setGuessMarker(savedDraft);
    } else if (state.roundStatus !== 'active' && !state.isPractice) {
      clearDraftGuess();
      setGuessMarker(null);
    }

    mapInitialized = true;
  }

  // Ambil leaderboard jika belum ada
  if (!state.leaderboard) {
    const cachedLb = loadLeaderboardCache();
    if (cachedLb) setLeaderboardData(cachedLb);

    getLeaderboard(state.leaderboardType || 'total')
      .then((data) => setLeaderboardData(data))
      .catch((err) => console.warn('Gagal memuat papan peringkat:', err.message));
  }

  renderMapLegend(viewport);
  renderDesktopPanel(viewport, state);
  renderBottomSheet(viewport, state);

  // Onboarding untuk pemain baru (Fase B)
  if (!isTutorialDone() && !isTutorialActive() && state.player) {
    setTimeout(() => {
      if (!isTutorialDone() && !isTutorialActive()) {
        startInteractiveTutorial({
          onStartPractice: () => {
            startPracticeAction();
          },
          onComplete: () => {
            render(getState());
          },
        });
      }
    }, 400);
  }
}

function createTabNavigation(currentTab, onSelect) {
  const tabHeader = document.createElement('div');
  tabHeader.className = 'tabs';
  tabHeader.style.padding = '0 var(--space-2)';

  const tabs = [
    { id: 'round', label: 'Permainan' },
    { id: 'leaderboard', label: 'Peringkat' },
    { id: 'stats', label: 'Profil' },
    { id: 'tutorial', label: 'Panduan' },
  ];

  for (const t of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.setAttribute('aria-selected', currentTab === t.id ? 'true' : 'false');
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      onSelect(t.id);
    });
    tabHeader.append(btn);
  }

  return tabHeader;
}

function renderTabPanelContent(container, tabName, state) {
  if (tabName === 'round') {
    renderRoundContent(container, state);
  } else if (tabName === 'leaderboard') {
    renderLeaderboardContent(container, state);
  } else if (tabName === 'stats') {
    renderStatsContent(container, state);
  } else {
    renderTutorialContent(container, state);
  }
}

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
    { type: 'trail', label: 'Jejak Orbit' },
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
    render(state);
  });

  const panelBody = document.createElement('div');
  panelBody.className = 'side-panel-body';
  renderTabPanelContent(panelBody, activeTab, state);

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

  const subtitle = document.createElement('span');
  subtitle.style.fontSize = 'var(--text-xs)';
  subtitle.style.color = 'var(--text-secondary)';

  if (activeTab === 'round') {
    if (state.roundStatus === 'active') {
      title.textContent = 'Ronde Berjalan';
      subtitle.textContent = 'Klik peta lalu kunci tebakan';
    } else if (state.roundStatus === 'result') {
      title.textContent = 'Hasil Ronde';
      subtitle.textContent = 'Lihat perolehan skor dan jarak';
    } else if (state.roundStatus === 'submitting') {
      title.textContent = 'Menghitung Skor';
      subtitle.textContent = 'Memproses tebakan di server…';
    } else {
      title.textContent = 'ISS Hunter';
      subtitle.textContent = 'Mulai ronde untuk menebak posisi ISS';
    }
  } else if (activeTab === 'leaderboard') {
    title.textContent = 'Papan Peringkat';
    subtitle.textContent = 'Pemain dengan skor tertinggi';
  } else if (activeTab === 'stats') {
    title.textContent = 'Profil Pemain';
    subtitle.textContent = `${state.player?.displayName || 'Pemain'} • Statistik & Lencana`;
  } else {
    title.textContent = 'Panduan Permainan';
    subtitle.textContent = 'Cara membaca peta & fakta orbit ISS';
  }

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

  // Tab Header untuk navigasi mobile
  const tabHeader = createTabNavigation(activeTab, (newTab) => {
    activeTab = newTab;
    bottomSheetExpanded = true;
    render(state);
  });

  const sheetBody = document.createElement('div');
  sheetBody.className = 'bottom-sheet-body';
  renderTabPanelContent(sheetBody, activeTab, state);

  sheet.append(sheetHeader, tabHeader, sheetBody);
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

  // MODE LATIHAN (Fase B)
  if (state.isPractice) {
    if (state.practiceResult) {
      const practiceBox = document.createElement('div');
      practiceBox.className = 'stat-list';

      const badgeRow = document.createElement('div');
      badgeRow.style.marginBottom = 'var(--space-2)';
      const badge = document.createElement('span');
      badge.className = 'practice-badge';
      badge.textContent = 'Hasil Ronde Latihan';
      badgeRow.append(badge);

      const distRow = document.createElement('div');
      distRow.className = 'stat-row';
      const distLabel = document.createElement('span');
      distLabel.className = 'stat-label';
      distLabel.textContent = 'Jarak Tebakan';
      const distVal = document.createElement('span');
      distVal.className = 'stat-value tabular';
      distVal.textContent = `${state.practiceResult.distanceKm.toFixed(1)} km`;
      distRow.append(distLabel, distVal);

      practiceBox.append(badgeRow, distRow);

      const noteBox = document.createElement('div');
      noteBox.className = 'panel';
      noteBox.style.marginTop = 'var(--space-3)';
      noteBox.style.backgroundColor = 'var(--surface-hover)';

      const noteText = document.createElement('p');
      noteText.style.fontSize = 'var(--text-xs)';
      noteText.style.color = 'var(--text-secondary)';
      noteText.style.lineHeight = '1.5';
      noteText.textContent = state.practiceResult.message;

      const disclaimer = document.createElement('p');
      disclaimer.style.fontSize = 'var(--text-xs)';
      disclaimer.style.color = 'var(--text-secondary)';
      disclaimer.style.marginTop = 'var(--space-2)';
      disclaimer.textContent =
        'Ronde latihan bersifat bebas tanpa skor dan tidak mempengaruhi statistik atau leaderboard.';

      noteBox.append(noteText, disclaimer);

      const btnWrap = document.createElement('div');
      btnWrap.style.display = 'flex';
      btnWrap.style.flexDirection = 'column';
      btnWrap.style.gap = 'var(--space-2)';
      btnWrap.style.marginTop = 'var(--space-4)';

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn btn-secondary';
      retryBtn.textContent = 'Ulangi Latihan';
      retryBtn.addEventListener('click', () => {
        setPracticeResult(null);
        clearRoundResult();
        clearDraftGuess();
      });

      const startRealBtn = document.createElement('button');
      startRealBtn.type = 'button';
      startRealBtn.className = 'btn btn-primary';
      startRealBtn.textContent = 'Mulai Ronde Sungguhan';
      startRealBtn.addEventListener('click', () => {
        setPracticeMode(false);
        clearPracticeGuide();
        clearRoundResult();
        clearDraftGuess();
        startNewRoundAction();
      });

      btnWrap.append(retryBtn, startRealBtn);
      container.append(practiceBox, noteBox, btnWrap);
      return;
    }

    // Ronde latihan aktif (sedang menebak)
    const practiceActiveBox = document.createElement('div');

    const badge = document.createElement('div');
    badge.className = 'practice-badge';
    badge.style.marginBottom = 'var(--space-3)';
    badge.textContent = 'Mode Latihan (Tanpa Skor)';

    const guideNote = document.createElement('p');
    guideNote.className = 'form-hint';
    guideNote.style.marginBottom = 'var(--space-3)';
    guideNote.style.lineHeight = '1.4';
    guideNote.textContent =
      'Gunakan garis putus-putus pada peta sebagai perkiraan arah orbit ISS. Klik peta untuk menaruh tebakanmu.';

    practiceActiveBox.append(badge, guideNote);

    const guessInfo = document.createElement('div');
    guessInfo.className = 'panel';
    guessInfo.style.marginBottom = 'var(--space-4)';

    if (state.draftGuess) {
      const latText = state.draftGuess.lat.toFixed(4);
      const lngText = state.draftGuess.lng.toFixed(4);
      const row = document.createElement('div');
      row.className = 'stat-row';
      const label = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = 'Koordinat Pilihan';
      const value = document.createElement('span');
      value.className = 'stat-value tabular';
      value.textContent = `${latText}°, ${lngText}°`;
      row.append(label, value);
      guessInfo.append(row);
    } else {
      const emptyHint = document.createElement('p');
      emptyHint.style.fontSize = 'var(--text-xs)';
      emptyHint.style.color = 'var(--text-secondary)';
      emptyHint.textContent = 'Belum ada tebakan. Klik di mana saja pada peta.';
      guessInfo.append(emptyHint);
    }

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn btn-primary';
    lockBtn.style.width = '100%';
    lockBtn.disabled = !state.draftGuess;
    lockBtn.textContent = 'Kunci Tebakan Latihan';
    lockBtn.addEventListener('click', lockPracticeGuessAction);

    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'btn btn-ghost';
    exitBtn.style.width = '100%';
    exitBtn.style.marginTop = 'var(--space-2)';
    exitBtn.textContent = 'Batal / Ronde Sungguhan';
    exitBtn.addEventListener('click', () => {
      setPracticeMode(false);
      clearPracticeGuide();
      clearRoundResult();
      clearDraftGuess();
    });

    container.append(practiceActiveBox, guessInfo, lockBtn, exitBtn);
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

    // 2. Skor ronde (dengan animasi hitung naik)
    const scoreRow = document.createElement('div');
    scoreRow.className = 'stat-row';
    const scoreLabel = document.createElement('span');
    scoreLabel.className = 'stat-label';
    scoreLabel.textContent = 'Skor Ronde';
    const scoreVal = document.createElement('span');
    scoreVal.className = 'stat-value tabular';

    const targetScore = state.roundResult.score;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || targetScore === 0) {
      scoreVal.textContent = `${targetScore} poin`;
    } else {
      scoreVal.textContent = '0 poin';
      const duration = 800;
      const startTime = performance.now();
      const countUp = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const current = Math.floor(targetScore * progress);
        scoreVal.textContent = `${current} poin`;
        if (progress < 1) {
          requestAnimationFrame(countUp);
        } else {
          scoreVal.textContent = `${targetScore} poin`;
        }
      };
      requestAnimationFrame(countUp);
    }
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

      const badgeMap = {
        pemula: 'Pemula Orbit',
        navigator: 'Navigator Angkasa',
        sniper: 'Sniper Presisi',
        orbitPenuh: 'Orbit Penuh (90m)',
        tanpaJejak: 'Tanpa Jejak (Pakar)',
      };

      const badgeList = document.createElement('span');
      badgeList.style.fontSize = 'var(--text-xs)';
      badgeList.style.fontWeight = '500';
      badgeList.textContent = state.roundResult.newBadges
        .map((b) => badgeMap[b] || b.charAt(0).toUpperCase() + b.slice(1))
        .join(', ');

      badgeBox.append(badgeHeading, badgeList);
      resultBox.append(badgeBox);
    }

    // Fakta edukatif acak (C6)
    const factText =
      state.roundResult.educationalFact ||
      'ISS mengorbit Bumi sekitar 16 kali setiap 24 jam dengan kecepatan ~27.600 km/jam!';
    const factBox = document.createElement('div');
    factBox.className = 'panel';
    factBox.style.marginTop = 'var(--space-3)';
    factBox.style.backgroundColor = 'var(--surface-hover)';

    const factTitle = document.createElement('div');
    factTitle.style.fontSize = 'var(--text-xs)';
    factTitle.style.fontWeight = '600';
    factTitle.style.color = 'var(--accent)';
    factTitle.style.marginBottom = '4px';
    factTitle.textContent = 'Fakta Orbit Edukatif:';

    const factContent = document.createElement('p');
    factContent.style.fontSize = 'var(--text-xs)';
    factContent.style.color = 'var(--text-secondary)';
    factContent.style.lineHeight = '1.45';
    factContent.textContent = factText;

    factBox.append(factTitle, factContent);
    resultBox.append(factBox);

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
    countdownWrap.style.gap = 'var(--space-2)';
    countdownWrap.style.marginBottom = 'var(--space-1)';

    const timeLabel = document.createElement('span');
    timeLabel.className = 'stat-label';
    timeLabel.textContent = 'Sisa waktu untuk mengunci tebakan';

    const timeValue = document.createElement('span');
    timeValue.className = 'stat-value tabular';
    timeValue.id = 'countdown-timer-value';
    timeValue.textContent = formatRemainingTime(state.activeRound.startedAt);

    countdownWrap.append(timeLabel, timeValue);

    const horizonSec = state.activeRound.horizonSeconds || 600;
    const horizonMin = Math.round(horizonSec / 60);
    const diff = state.activeRound.difficulty || 'normal';
    const diffLabels = {
      easy: 'Mudah (×0.5)',
      normal: 'Normal (×1.0)',
      hard: 'Sulit (×1.5)',
      expert: 'Pakar (×2.0)',
    };

    const modeBadge = document.createElement('div');
    modeBadge.style.fontSize = 'var(--text-xs)';
    modeBadge.style.color = 'var(--accent)';
    modeBadge.style.fontWeight = '600';
    modeBadge.style.marginBottom = 'var(--space-2)';
    modeBadge.textContent = `Mode: +${horizonMin} Menit • ${diffLabels[diff] || diff}`;

    const timerNote = document.createElement('p');
    timerNote.className = 'form-hint';
    timerNote.style.marginBottom = 'var(--space-3)';
    timerNote.style.lineHeight = '1.4';

    if (diff === 'expert') {
      timerNote.textContent =
        'Mode Pakar: Jejak lintasan dan panah arah disembunyikan. Hasil dihitung seketika saat dikunci.';
    } else if (diff === 'easy') {
      timerNote.textContent =
        'Mode Mudah: Perkiraan garis orbit ditampilkan pada peta. Hasil dihitung seketika saat dikunci.';
    } else if (horizonSec === 5400) {
      timerNote.textContent =
        'Horizon 90 Menit (1 Orbit): Ingat, Bumi berputar ~23° ke timur selama 1 orbit ISS!';
    } else {
      timerNote.textContent =
        'Hasil dan skor langsung dihitung seketika setelah kamu mengunci tebakan.';
    }

    roundBox.append(countdownWrap, modeBadge, timerNote);

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
      hintText.textContent = `Klik titik di peta di mana kamu memperkirakan ISS akan berada ${horizonMin} menit ke depan.`;
      guessInfo.append(hintText);
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
    emptyMsg.textContent = 'Pilih pengaturan ronde di bawah untuk mulai menebak posisi ISS:';
    emptyBox.append(emptyMsg);
  }

  // Pengaturan Horizon & Kesulitan (C3 & C4)
  const currentLevel =
    state.stats?.level ||
    state.player?.level ||
    Math.floor((state.stats?.totalScore || 0) / 2000) + 1;

  const setupCard = document.createElement('div');
  setupCard.className = 'panel';
  setupCard.style.marginBottom = 'var(--space-3)';

  const horizonTitle = document.createElement('div');
  horizonTitle.className = 'stat-label';
  horizonTitle.style.fontWeight = '600';
  horizonTitle.style.marginBottom = 'var(--space-2)';
  horizonTitle.textContent = 'Horizon Waktu Prediksi:';

  const horizonGrid = document.createElement('div');
  horizonGrid.style.display = 'grid';
  horizonGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  horizonGrid.style.gap = 'var(--space-2)';
  horizonGrid.style.marginBottom = 'var(--space-3)';

  const horizonOptions = [
    { seconds: 120, label: '+2 Menit', minLevel: 1, desc: 'Jarak dekat' },
    { seconds: 600, label: '+10 Menit', minLevel: 1, desc: 'Standar (~4.600 km)' },
    { seconds: 1800, label: '+30 Menit', minLevel: 2, desc: '1/3 orbit Bumi' },
    { seconds: 5400, label: '+90 Menit', minLevel: 4, desc: '1 orbit penuh' },
  ];

  for (const opt of horizonOptions) {
    const isLocked = currentLevel < opt.minLevel;
    const isSelected = (state.preferredHorizon || 600) === opt.seconds;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`;
    btn.style.display = 'flex';
    btn.style.flexDirection = 'column';
    btn.style.alignItems = 'center';
    btn.style.gap = '2px';
    btn.style.padding = 'var(--space-2)';
    btn.disabled = isLocked;

    const mainText = document.createElement('span');
    mainText.style.fontWeight = '600';
    mainText.textContent = opt.label;

    const subText = document.createElement('span');
    subText.style.fontSize = '10px';
    subText.style.opacity = '0.85';
    subText.textContent = isLocked ? `🔒 Lv. ${opt.minLevel}` : opt.desc;

    btn.append(mainText, subText);
    btn.addEventListener('click', () => {
      setPreferredHorizon(opt.seconds);
      setTrailHorizon(opt.seconds);
    });

    horizonGrid.append(btn);
  }

  const diffTitle = document.createElement('div');
  diffTitle.className = 'stat-label';
  diffTitle.style.fontWeight = '600';
  diffTitle.style.marginBottom = 'var(--space-2)';
  diffTitle.textContent = 'Tingkat Kesulitan:';

  const diffGrid = document.createElement('div');
  diffGrid.style.display = 'grid';
  diffGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  diffGrid.style.gap = 'var(--space-2)';

  const diffOptions = [
    { key: 'easy', label: 'Mudah', minLevel: 1, mult: '×0.5', desc: 'Garis bantu arah' },
    { key: 'normal', label: 'Normal', minLevel: 1, mult: '×1.0', desc: 'Jejak orbit biasa' },
    { key: 'hard', label: 'Sulit', minLevel: 3, mult: '×1.5', desc: 'Peluruhan 900 km' },
    { key: 'expert', label: 'Pakar', minLevel: 5, mult: '×2.0', desc: 'Tanpa jejak & panah' },
  ];

  for (const opt of diffOptions) {
    const isLocked = currentLevel < opt.minLevel;
    const isSelected = (state.preferredDifficulty || 'normal') === opt.key;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`;
    btn.style.display = 'flex';
    btn.style.flexDirection = 'column';
    btn.style.alignItems = 'center';
    btn.style.gap = '2px';
    btn.style.padding = 'var(--space-2)';
    btn.disabled = isLocked;

    const mainText = document.createElement('span');
    mainText.style.fontWeight = '600';
    mainText.textContent = `${opt.label} (${opt.mult})`;

    const subText = document.createElement('span');
    subText.style.fontSize = '10px';
    subText.style.opacity = '0.85';
    subText.textContent = isLocked ? `🔒 Lv. ${opt.minLevel}` : opt.desc;

    btn.append(mainText, subText);
    btn.addEventListener('click', () => {
      setPreferredDifficulty(opt.key);
      setMapDifficulty(opt.key);
    });

    diffGrid.append(btn);
  }

  setupCard.append(horizonTitle, horizonGrid, diffTitle, diffGrid);

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn-primary';
  startBtn.style.width = '100%';
  startBtn.textContent = 'Mulai Ronde Sungguhan';
  startBtn.addEventListener('click', startNewRoundAction);

  const practiceBtn = document.createElement('button');
  practiceBtn.type = 'button';
  practiceBtn.className = 'btn btn-secondary';
  practiceBtn.style.width = '100%';
  practiceBtn.style.marginTop = 'var(--space-2)';
  practiceBtn.textContent = 'Coba Ronde Latihan';
  practiceBtn.addEventListener('click', startPracticeAction);

  container.append(emptyBox, setupCard, startBtn, practiceBtn);
}

function renderLeaderboardContent(container, state) {
  const currentType = state.leaderboardType || 'total';

  // Sub-tabs navigation (C5: Total, Rata-rata, Hari Ini)
  const subTabNav = document.createElement('div');
  subTabNav.style.display = 'flex';
  subTabNav.style.gap = 'var(--space-1)';
  subTabNav.style.marginBottom = 'var(--space-3)';
  subTabNav.style.borderBottom = '1px solid var(--border)';
  subTabNav.style.paddingBottom = 'var(--space-2)';

  const tabs = [
    { id: 'total', label: 'Total Skor' },
    { id: 'average', label: 'Rata-rata (Min. 5)' },
    { id: 'today', label: 'Hari Ini' },
  ];

  for (const t of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${currentType === t.id ? 'btn-primary' : 'btn-ghost'}`;
    btn.style.padding = '4px 10px';
    btn.style.fontSize = 'var(--text-xs)';
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
    if (currentType === 'average') {
      text.textContent = 'Belum ada pemain dengan minimal 5 ronde selesai.';
    } else if (currentType === 'today') {
      text.textContent = 'Belum ada ronde yang diselesaikan hari ini. Jadilah yang pertama!';
    } else {
      text.textContent = 'Belum ada data pemain di papan peringkat.';
    }
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
  if (currentType === 'average') {
    thScore.textContent = 'Rata-rata';
  } else if (currentType === 'today') {
    thScore.textContent = 'Skor Hari Ini';
  } else {
    thScore.textContent = 'Total Skor';
  }
  thScore.style.textAlign = 'right';

  const thRounds = document.createElement('th');
  thRounds.textContent = 'Ronde';
  thRounds.style.textAlign = 'right';
  thRounds.style.width = '55px';

  trHead.append(thRank, thName, thScore, thRounds);
  thead.append(trHead);
  table.append(thead);

  const tbody = document.createElement('tbody');
  const currentDisplayName = state.player?.displayName;

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (
      currentDisplayName &&
      row.displayName?.toLowerCase() === currentDisplayName?.toLowerCase()
    ) {
      tr.className = 'current-player';
    }

    const tdRank = document.createElement('td');
    tdRank.className = 'col-rank';
    tdRank.textContent = String(row.rank);

    const tdName = document.createElement('td');
    tdName.textContent = row.displayName;

    const tdScore = document.createElement('td');
    tdScore.className = 'col-score';
    if (currentType === 'average') {
      tdScore.textContent = row.avgScore !== null ? `${row.avgScore} pt` : '-';
    } else {
      tdScore.textContent = String(row.totalScore);
    }

    const tdRounds = document.createElement('td');
    tdRounds.style.textAlign = 'right';
    tdRounds.style.color = 'var(--text-secondary)';
    tdRounds.textContent = String(row.roundsDone ?? 0);

    tr.append(tdRank, tdName, tdScore, tdRounds);
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

function renderTutorialContent(container) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = 'var(--space-3)';

  // 1. Kartu Pengenalan ISS
  const introCard = document.createElement('div');
  introCard.className = 'panel';
  introCard.style.backgroundColor = 'var(--surface-hover)';

  const introTitle = document.createElement('h3');
  introTitle.style.fontSize = 'var(--text-sm)';
  introTitle.style.fontWeight = '600';
  introTitle.style.color = 'var(--accent)';
  introTitle.style.marginBottom = 'var(--space-1)';
  introTitle.textContent = 'Misi: Prediksi Posisi ISS (+10 Menit)';

  const introDesc = document.createElement('p');
  introDesc.style.fontSize = 'var(--text-xs)';
  introDesc.style.color = 'var(--text-secondary)';
  introDesc.style.lineHeight = '1.5';
  introDesc.textContent =
    'ISS (Stasiun Luar Angkasa Internasional) meluncur di orbit Bumi pada ketinggian ~400 km dengan kecepatan dahsyat ~27.600 km/jam (~7,6 km/detik). Satu putaran penuh Bumi diselesaikan hanya dalam ~92 menit!';

  introCard.append(introTitle, introDesc);

  // 2. Fakta Angka
  const factsList = document.createElement('div');
  factsList.className = 'stat-list';
  const facts = [
    { label: 'Kecepatan Orbit', value: '~27.600 km/jam' },
    { label: 'Jarak 10 Menit', value: '~4.600 km (~39° Bujur)' },
    { label: 'Kemiringan Orbit', value: '51,6° terhadap Khatulistiwa' },
    { label: '1 Keliling Bumi', value: '~92 menit' },
  ];
  for (const f of facts) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const l = document.createElement('span');
    l.className = 'stat-label';
    l.textContent = f.label;
    const v = document.createElement('span');
    v.className = 'stat-value tabular';
    v.style.fontSize = 'var(--text-xs)';
    v.textContent = f.value;
    row.append(l, v);
    factsList.append(row);
  }

  // 3. Cara Membaca Peta & Menebak
  const guideCard = document.createElement('div');
  guideCard.className = 'panel';

  const guideTitle = document.createElement('h3');
  guideTitle.style.fontSize = 'var(--text-sm)';
  guideTitle.style.fontWeight = '600';
  guideTitle.style.marginBottom = 'var(--space-2)';
  guideTitle.textContent = 'Cara Membaca Peta & Menebak';

  const steps = [
    {
      num: '1',
      title: 'Ikon Target & Panah',
      desc: 'Menunjukkan posisi ISS saat ini secara live. Panah kecil di sekelilingnya menunjukkan arah ke mana ISS sedang terbang.',
    },
    {
      num: '2',
      title: 'Garis Jejak Orbit',
      desc: 'Garis berwarna aksen menunjukkan jalur yang telah dilalui ISS selama 10 menit ke belakang. Perhatikan lengkungan gelombang kurvanya.',
    },
    {
      num: '3',
      title: 'Tebak Jalur Masa Depan',
      desc: 'Klik di peta pada titik yang kamu perkirakan akan dilewati ISS 10 menit ke depan (ditandai dengan pin tebakanmu).',
    },
    {
      num: '4',
      title: 'Kunci & Dapatkan Skor',
      desc: 'Tekan "Kunci Tebakan" (atau Enter). Server akan mengambil koordinat nyata ISS pada menit ke-10 dan menghitung skor dari jaraknya!',
    },
  ];

  const stepsList = document.createElement('div');
  stepsList.style.display = 'flex';
  stepsList.style.flexDirection = 'column';
  stepsList.style.gap = 'var(--space-2)';

  for (const s of steps) {
    const stepRow = document.createElement('div');
    stepRow.style.display = 'flex';
    stepRow.style.gap = 'var(--space-2)';
    stepRow.style.alignItems = 'flex-start';

    const numBadge = document.createElement('span');
    numBadge.className = 'tag tag-accent';
    numBadge.style.minWidth = '20px';
    numBadge.style.textAlign = 'center';
    numBadge.textContent = s.num;

    const content = document.createElement('div');
    const t = document.createElement('div');
    t.style.fontSize = 'var(--text-xs)';
    t.style.fontWeight = '600';
    t.textContent = s.title;

    const d = document.createElement('div');
    d.style.fontSize = 'var(--text-xs)';
    d.style.color = 'var(--text-secondary)';
    d.style.lineHeight = '1.4';
    d.textContent = s.desc;

    content.append(t, d);
    stepRow.append(numBadge, content);
    stepsList.append(stepRow);
  }
  guideCard.append(guideTitle, stepsList);

  // 4. Tombol Aksi
  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.flexDirection = 'column';
  btnGroup.style.gap = 'var(--space-2)';
  btnGroup.style.marginTop = 'var(--space-1)';

  const practiceBtn = document.createElement('button');
  practiceBtn.type = 'button';
  practiceBtn.className = 'btn btn-secondary';
  practiceBtn.style.width = '100%';
  practiceBtn.textContent = 'Coba Ronde Latihan (Alat Bantu)';
  practiceBtn.addEventListener('click', startPracticeAction);

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'btn btn-primary';
  playBtn.style.width = '100%';
  playBtn.textContent = 'Mulai Ronde Sungguhan!';
  playBtn.addEventListener('click', () => {
    activeTab = 'round';
    startNewRoundAction();
  });

  btnGroup.append(practiceBtn, playBtn);

  wrapper.append(introCard, factsList, guideCard, btnGroup);
  container.append(wrapper);
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
    setPracticeMode(false);
    clearPracticeGuide();
    clearRoundResult();

    const horizon = state.preferredHorizon || 600;
    const diff = state.preferredDifficulty || 'normal';
    setMapDifficulty(diff);
    setTrailHorizon(horizon);

    const roundData = await startRound(state.token, {
      horizon_seconds: horizon,
      difficulty: diff,
    });
    setActiveRound(roundData);
    if (roundData.difficulty) setMapDifficulty(roundData.difficulty);
    if (roundData.horizonSeconds) setTrailHorizon(roundData.horizonSeconds);

    fetchCurrentIssPosition()
      .then((pos) => updateIssPosition(pos))
      .catch(() => {});
    fetchIssTrail(roundData.horizonSeconds || horizon)
      .then((trail) => updateIssTrail(trail))
      .catch(() => {});
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal memulai ronde baru.');
  }
}

function startPracticeAction() {
  clearRoundResult();
  clearDraftGuess();
  setActiveRound(null);
  setPracticeMode(true);
  enablePracticeGuide(true);
  activeTab = 'round';
  bottomSheetExpanded = true;
  render(getState());
}

async function lockPracticeGuessAction() {
  const state = getState();
  if (!state.token || !state.draftGuess) return;

  const coords = state.draftGuess;
  setRoundStatus('submitting');

  try {
    const result = await submitPracticeGuess(coords, state.token);
    showRoundResult(coords, { lat: result.answer.lat, lng: result.answer.lng }, 600);
    setPracticeResult(result);
    setRoundStatus('idle');
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal menghitung tebakan latihan.');
  }
}

async function lockGuessAction() {
  const state = getState();
  if (!state.token || !state.activeRound || !state.draftGuess) return;

  const roundId = state.activeRound.roundId;
  const coords = state.draftGuess;
  const horizonSec = state.activeRound.horizonSeconds || 600;

  setRoundStatus('submitting');

  try {
    const result = await submitGuess(roundId, coords, state.token);
    showRoundResult(coords, { lat: result.answer.lat, lng: result.answer.lng }, horizonSec);
    setRoundStatus('result', result);
    clearDraftGuess();

    // Perbarui profil dan stats pemain
    const meData = await getMe(state.token);
    import('./store.js').then(({ setPlayerData }) => {
      setPlayerData(meData.player, meData.stats);
    });

    // Refresh papan peringkat terbaru sesuai tab yang aktif
    getLeaderboard(state.leaderboardType || 'total')
      .then((data) => setLeaderboardData(data))
      .catch((err) => console.warn('Gagal memuat papan peringkat:', err.message));
  } catch (err) {
    setRoundStatus('idle', null, err.message || 'Gagal mengunci tebakan.');
  }
}
