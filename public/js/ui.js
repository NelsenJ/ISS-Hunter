/**
 * ISS Hunter — UI Renderer
 * Mengatur antarmuka pengguna: form masuk/daftar, validasi nama saat input,
 * status profil, header interaktif, dan penanganan error.
 * Seluruh teks pengguna dirender dengan textContent untuk mencegah XSS.
 */

import { getState, resetStore } from './store.js';
import { signIn, signUp, signOut } from './auth.js';
import { createProfile, getMe } from './api.js';

let appContainer = null;
let headerPlayerEl = null;
let headerProgressFillEl = null;
let authMode = 'login'; // 'login' | 'register' | 'profile'

export function initUI(container) {
  appContainer = container;
  headerPlayerEl = document.getElementById('header-player-info');
  headerProgressFillEl = document.getElementById('header-progress-fill');
}

export function render(state = getState()) {
  if (!appContainer) return;

  renderHeader(state);

  // Jika belum login atau profil wajib dibuat
  if (!state.token || !state.player || state.profileRequired) {
    renderAuthScreen(state);
    return;
  }

  // Jika sudah login dan profil ada
  renderDashboard(state);
}

function renderHeader(state) {
  if (!headerPlayerEl) return;

  // Bersihkan elemen header player
  headerPlayerEl.replaceChildren();

  if (state.player) {
    const level = state.stats?.level ?? 1;
    const progress = state.stats?.progress ?? 0;
    const progressPercent = Math.min(100, Math.max(0, (progress / 2000) * 100));

    // Nama pemain
    const nameEl = document.createElement('span');
    nameEl.className = 'player-name';
    nameEl.style.fontSize = 'var(--text-sm)';
    nameEl.style.fontWeight = '500';
    nameEl.textContent = state.player.displayName;

    // Badge level
    const levelEl = document.createElement('span');
    levelEl.className = 'tag tag-accent tabular';
    levelEl.textContent = `Lv. ${level}`;

    // Tombol keluar
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

  // Sesuaikan judul dan deskripsi berdasarkan state dan mode
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

  // Form
  const form = document.createElement('form');
  form.noValidate = true;

  // Wadah Pesan Error Form
  const formErrorEl = document.createElement('div');
  formErrorEl.className = 'form-error';
  formErrorEl.style.marginBottom = 'var(--space-3)';

  // Input Field: Email & Password (hanya jika bukan mode profile saja)
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

  // Input Field: Nama Tampilan (hanya saat register atau profileRequired)
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

    // Validasi realtime pada event input sesuai spesifikasi
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

  // Tombol Submit Utama
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

  // Footer: Tautan ganti mode
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

  // Event Submit Form
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

function renderDashboard(state) {
  appContainer.replaceChildren();

  const container = document.createElement('div');
  container.className = 'page-container';

  // Panel Profil & Statistik Pemain
  const profilePanel = document.createElement('section');
  profilePanel.className = 'panel';
  profilePanel.style.marginBottom = 'var(--space-6)';

  const profileHeader = document.createElement('div');
  profileHeader.style.display = 'flex';
  profileHeader.style.justifyContent = 'space-between';
  profileHeader.style.alignItems = 'center';
  profileHeader.style.marginBottom = 'var(--space-4)';

  const greetingEl = document.createElement('h1');
  greetingEl.style.fontSize = 'var(--text-xl)';
  greetingEl.textContent = state.player.displayName;

  const levelTag = document.createElement('span');
  levelTag.className = 'tag tag-accent tabular';
  levelTag.textContent = `Tingkat ${state.stats?.level ?? 1}`;

  profileHeader.append(greetingEl, levelTag);

  // Kartu Hasil Statistik
  const statList = document.createElement('div');
  statList.className = 'stat-list';

  const rows = [
    { label: 'Total Skor', value: `${state.stats?.totalScore ?? 0} poin` },
    { label: 'Ronde Diselesaikan', value: `${state.stats?.roundsDone ?? 0}` },
    {
      label: 'Jarak Tebakan Terbaik',
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

  // Daftar Lencana
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
  profilePanel.append(profileHeader, statList, badgeSection);

  // Panel Peta (Fase 3 placeholder)
  const mapPanel = document.createElement('section');
  mapPanel.className = 'panel';

  const mapHeading = document.createElement('h2');
  mapHeading.style.fontSize = 'var(--text-base)';
  mapHeading.style.marginBottom = 'var(--space-2)';
  mapHeading.textContent = 'Peta dan Ronde Permainan';

  const mapDesc = document.createElement('p');
  mapDesc.style.fontSize = 'var(--text-sm)';
  mapDesc.style.color = 'var(--text-secondary)';
  mapDesc.textContent =
    'Sesi login berhasil diverifikasi. Peta interaktif Leaflet, posisi orbit ISS live, dan penguncian tebakan akan aktif di Fase 3.';

  mapPanel.append(mapHeading, mapDesc);

  container.append(profilePanel, mapPanel);
  appContainer.append(container);
}
