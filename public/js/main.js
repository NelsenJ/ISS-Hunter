import { getHealth, getConfig } from './api.js';
import { initTheme, toggleTheme } from './theme.js';

const statusDotEl = document.querySelector('#server-status .status-dot');
const statusTextEl = document.getElementById('server-status-text');
const statServerEl = document.getElementById('stat-server');
const statConfigEl = document.getElementById('stat-config');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

function setStatus(state, text) {
  if (statusDotEl) statusDotEl.dataset.state = state;
  if (statusTextEl) statusTextEl.textContent = text;
}

async function checkSystem() {
  setStatus('checking', 'Memeriksa server…');

  try {
    const health = await getHealth();
    setStatus('online', 'Server online');
    if (statServerEl) {
      statServerEl.textContent = `Online (${health.uptimeSeconds}s uptime)`;
    }
  } catch {
    setStatus('offline', 'Server offline');
    if (statServerEl) {
      statServerEl.textContent = 'Tidak terjangkau';
    }
  }

  try {
    const config = await getConfig();
    if (statConfigEl) {
      statConfigEl.textContent = config.supabaseUrl ? 'Terkonfigurasi' : 'Belum diatur';
    }
  } catch {
    if (statConfigEl) {
      statConfigEl.textContent = 'Gagal memuat';
    }
  }
}

// Inisialisasi tema saat modul dimuat
initTheme();

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    toggleTheme();
  });
}

checkSystem();
