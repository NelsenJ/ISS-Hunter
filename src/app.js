import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import healthRoutes from './routes/health.js';
import configRoutes from './routes/config.js';
import profileRoutes from './routes/profile.js';
import meRoutes from './routes/me.js';
import roundsRoutes from './routes/rounds.js';
import issRoutes from './routes/iss.js';
import { CSP_DIRECTIVES } from './lib/csp.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const app = express();

// Hosting berada di belakang proxy. Tanpa ini, IP pengguna dan cookie aman (secure)
// tidak terbaca dengan benar.
app.set('trust proxy', 1);

// Header keamanan untuk respons dari Express. Menggunakan definisi direktif CSP bersama
// agar selaras dengan header berkas statis di vercel.json.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: CSP_DIRECTIVES,
    },
  }),
);

// Dipakai saat dijalankan lokal. Di Vercel, berkas di public/ disajikan langsung oleh CDN
// dan baris ini diabaikan (header keamanan untuk berkas statis diatur di vercel.json).
app.use(express.static(publicDir));

app.use(requestLogger);
app.use(express.json({ limit: '10kb' }));

app.use('/api/health', healthRoutes);
app.use('/api/config', configRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/me', meRoutes);
app.use('/api/rounds', roundsRoutes);
app.use('/api/iss', issRoutes);
app.use('/api', notFoundHandler);
app.use(errorHandler);

// Default export: Vercel mengenali berkas ini sebagai titik masuk Express.
// src/index.js memakai app yang sama untuk menjalankan server lokal.
export default app;
