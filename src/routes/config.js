import { Router } from 'express';
import { loadConfig } from '../config.js';

const router = Router();

export function configHandler(_req, res) {
  const config = loadConfig();
  return res.json({
    ok: true,
    data: {
      supabaseUrl: config.supabase.url,
      supabasePublishableKey: config.supabase.publishableKey,
    },
  });
}

// Mengembalikan URL dan kunci publishable Supabase untuk browser.
// Kunci rahasia (secretKey) tidak pernah disertakan di sini.
router.get('/', configHandler);

export default router;
