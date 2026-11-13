/**
 * Modul tunggal untuk konfigurasi Content Security Policy (CSP).
 * Digunakan oleh Helmet saat server berjalan lokal dan oleh vercel.json
 * untuk berkas statis di CDN Vercel.
 */

export const CSP_DIRECTIVES = Object.freeze({
  'default-src': ["'self'"],
  'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'https://*.basemaps.cartocdn.com', 'https://*.cartocdn.com'],
  'connect-src': ["'self'", 'https://*.supabase.co', 'https://api.wheretheiss.at'],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
});

/**
 * Mengubah objek direktif menjadi string header Content-Security-Policy.
 *
 * @param {Record<string, readonly string[]>} directives
 * @returns {string}
 */
export function buildCspHeader(directives = CSP_DIRECTIVES) {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}
