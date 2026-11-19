// Dijalankan di <head> sebelum rendering body untuk mencegah kedipan tema (FOIC)
(function () {
  try {
    const saved = localStorage.getItem('iss_theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    // Abaikan jika akses storage dibatasi browser
  }
})();
