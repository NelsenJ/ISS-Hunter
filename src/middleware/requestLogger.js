const QUIET_PATHS = new Set(['/api/health']);

/**
 * Mencatat satu baris per permintaan: metode, path, status, durasi.
 * Memakai req.path (tanpa query string) agar token atau data pribadi di URL tidak ikut tercatat.
 * Health check dilewati karena hosting memanggilnya berkala dan akan memenuhi log.
 */
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    if (QUIET_PATHS.has(req.path)) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
  });
  next();
}
