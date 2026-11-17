/**
 * ISS Hunter — Main Application Entrypoint
 */

import { initTheme, toggleTheme } from './theme.js';
import { getConfig, getHealth, getMe, getActiveRound } from './api.js';
import { initAuth, onAuthStateChange, getSession, signOut } from './auth.js';
import {
  subscribe,
  setConfigured,
  setAuthSession,
  setPlayerData,
  setProfileRequired,
  loadProfileCache,
  setActiveRound,
  loadSavedDraftGuess,
  setDraftGuess,
  clearDraftGuess,
  resetStore,
} from './store.js';
import { setGuessMarker } from './map.js';
import { initUI, render } from './ui.js';

const appContainer = document.getElementById('app-container');
const statusDotEl = document.querySelector('#server-status .status-dot');
const statusTextEl = document.getElementById('server-status-text');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

function setServerStatus(state, text) {
  if (statusDotEl) statusDotEl.dataset.state = state;
  if (statusTextEl) statusTextEl.textContent = text;
}

async function start() {
  // Inisialisasi sistem tema dan UI
  initTheme();
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
  initUI(appContainer);

  // Pasang listener re-render store
  subscribe(render);

  // Muat cache profil lokal untuk fast-render pertama
  const cached = loadProfileCache();
  if (cached?.player) {
    setPlayerData(cached.player, cached.stats);
  } else {
    render();
  }

  // Cek konektivitas server
  setServerStatus('checking', 'Memeriksa…');
  try {
    await getHealth();
    setServerStatus('online', 'Online');
  } catch {
    setServerStatus('offline', 'Offline');
  }

  // Ambil konfigurasi publik Supabase dari server
  try {
    const config = await getConfig();
    const isConfigured = Boolean(config?.supabaseUrl && config?.supabasePublishableKey);
    setConfigured(isConfigured);

    if (!isConfigured) {
      if (!cached) {
        renderNotice(
          'Konfigurasi Diperlukan',
          'Server belum terhubung ke database Supabase. Isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY di .env untuk mulai bermain.',
        );
      }
      return;
    }

    const ready = initAuth(config);
    if (!ready) {
      renderNotice(
        'Pustaka Autentikasi Gagal Dimuat',
        'Pustaka supabase-js tidak dapat diinisialisasi. Periksa koneksi internet untuk memuat aset CDN.',
      );
      return;
    }

    let isSyncing = false;
    async function syncUserSession(session) {
      if (isSyncing) return;
      isSyncing = true;

      try {
        if (session?.user && session?.access_token) {
          setAuthSession(session.user, session.access_token);
          try {
            const meData = await getMe(session.access_token);
            setPlayerData(meData.player, meData.stats);

            // Pulihkan ronde aktif dari server sebagai sumber kebenaran
            try {
              const activeRound = await getActiveRound(session.access_token);
              if (activeRound) {
                setActiveRound(activeRound);
                const savedDraft = loadSavedDraftGuess();
                if (savedDraft) {
                  setDraftGuess(savedDraft);
                  setGuessMarker(savedDraft);
                }
              } else {
                setActiveRound(null);
                clearDraftGuess();
                setGuessMarker(null);
              }
            } catch (roundErr) {
              console.warn('Gagal memulihkan status ronde aktif:', roundErr.message);
            }
          } catch (err) {
            if (err.code === 'PROFILE_REQUIRED' || err.status === 404) {
              setProfileRequired(true);
            } else if (err.status === 401) {
              console.warn('Sesi telah kedaluwarsa, mengembalikan ke layar masuk.');
              await signOut();
              resetStore();
            } else {
              console.warn('Gagal menyinkronkan profil terbaru:', err.message);
            }
          }
        } else {
          resetStore();
        }
      } finally {
        isSyncing = false;
      }
    }

    // Pantau perubahan sesi autentikasi
    onAuthStateChange(async (_event, session) => {
      await syncUserSession(session);
    });

    // Cek apakah sudah ada sesi aktif yang tersimpan
    const initialSession = await getSession();
    await syncUserSession(initialSession);
  } catch (err) {
    console.error('Gagal membaca konfigurasi klien:', err);
  }
}

function renderNotice(title, message) {
  if (!appContainer) return;
  appContainer.replaceChildren();

  const container = document.createElement('div');
  container.className = 'page-container';

  const panel = document.createElement('section');
  panel.className = 'panel';

  const heading = document.createElement('h1');
  heading.style.fontSize = 'var(--text-xl)';
  heading.style.marginBottom = 'var(--space-2)';
  heading.textContent = title;

  const desc = document.createElement('p');
  desc.style.color = 'var(--text-secondary)';
  desc.textContent = message;

  panel.append(heading, desc);
  container.append(panel);
  appContainer.append(container);
}

// Skrip dieksekusi setelah parsing DOM selesai
start();
