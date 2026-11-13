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
  if (process.env.NODE_ENV !== 'production') {
    console.log(`ISS Hunter berjalan di port ${config.port} (${config.nodeEnv})`);
  }
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`${signal} diterima, menutup server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

// Global error handling
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('SIGTERM', () => {
  if (process.env.NODE_ENV !== 'production')
    console.log('SIGTERM diterima, menutup server...');
  shutdown('SIGTERM');
});
process.on('SIGINT', () => shutdown('SIGINT'));
