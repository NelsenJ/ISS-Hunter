import 'dotenv/config';
import app from './app.js';
import { loadConfig } from './config.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Konfigurasi tidak valid: ${error.message}`);
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`ISS Hunter berjalan di port ${config.port} (${config.nodeEnv})`);
});

// Hosting biasa mengirim SIGTERM saat deploy ulang; tutup dengan rapi supaya permintaan
// yang sedang berjalan selesai.
function shutdown(signal) {
  console.log(`${signal} diterima, menutup server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
