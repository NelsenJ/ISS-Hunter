import { Router } from 'express';
import { getIssPositionNow, getIssTrail } from '../lib/issApi.js';

const router = Router();

const PROXY_CACHE_HEADER = 'public, s-maxage=5, stale-while-revalidate=10';

export async function issNowHandler(_req, res, next) {
  try {
    const data = await getIssPositionNow();
    res.setHeader('Cache-Control', PROXY_CACHE_HEADER);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

export async function issTrailHandler(_req, res, next) {
  try {
    const data = await getIssTrail();
    res.setHeader('Cache-Control', PROXY_CACHE_HEADER);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

router.get('/now', issNowHandler);
router.get('/trail', issTrailHandler);

export default router;
