import { Router } from 'express';

const router = Router();

export function healthHandler(_req, res) {
  res.json({
    ok: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
  });
}

// Dipakai hosting (dan halaman kita) untuk memeriksa apakah server hidup.
router.get('/', healthHandler);

export default router;
