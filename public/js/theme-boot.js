// Dijalankan di <head> sebelum rendering body untuk mencegah kedipan tema (FOIC)
(function () {
  try {
    const saved = localStorage.getItem('iss_theme');
    const theme =
      saved === 'light' || saved === 'dark'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    // Abaikan jika akses storage dibatasi browser
  }
})();
