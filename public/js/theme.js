/**
 * ISS Hunter — Theme Manager
 * Menyimpan tema di localStorage ('iss_theme'), menerapkan ke data-theme,
 * dan sinkron dengan preferensi sistem.
 */

const THEME_STORAGE_KEY = 'iss_theme';

export function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    const isDark = theme === 'dark';
    themeToggleBtn.setAttribute(
      'aria-label',
      isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap',
    );
    themeToggleBtn.setAttribute('title', isDark ? 'Mode terang' : 'Mode gelap');
    const labelEl = themeToggleBtn.querySelector('.theme-label');
    if (labelEl) {
      labelEl.textContent = isDark ? 'Terang' : 'Gelap';
    }
  }
}

export function initTheme() {
  const theme = getPreferredTheme();
  applyTheme(theme);

  // Pantau jika sistem operasi mengubah preferensi tema saat aplikasi terbuka
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
  return next;
}
