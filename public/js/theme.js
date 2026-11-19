/**
 * ISS Hunter — Theme Manager
 * Menyimpan tema di localStorage ('iss_theme'), menerapkan ke data-theme,
 * dan sinkron dengan preferensi sistem.
 */

import { createIcon } from './icons.js';

const THEME_STORAGE_KEY = 'iss_theme';

export function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark') {
    return 'dark';
  }
  return 'light';
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

    // Update icon (sun = terang, moon = gelap saat ini → klik ke terang)
    const iconWrap = themeToggleBtn.querySelector('.theme-icon');
    if (iconWrap) {
      const newIcon = createIcon(isDark ? 'sun' : 'moon', 18);
      newIcon.className = `icon-wrap theme-icon`;
      iconWrap.replaceWith(newIcon);
    }

    const labelEl = themeToggleBtn.querySelector('.theme-label');
    if (labelEl) {
      labelEl.textContent = isDark ? 'Terang' : 'Gelap';
    }
  }
}

export function initTheme() {
  const theme = getPreferredTheme();

  // Inject icon ke button sebelum applyTheme dipanggil
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn && !themeToggleBtn.querySelector('.theme-icon')) {
    const isDark = theme === 'dark';
    const icon = createIcon(isDark ? 'sun' : 'moon', 18);
    icon.className = `icon-wrap theme-icon`;
    themeToggleBtn.prepend(icon);
  }

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
