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

export async function issTrailHandler(req, res, next) {
  try {
    const rawHorizon = req.query?.horizon ? Number(req.query.horizon) : 600;
    const horizon = Number.isFinite(rawHorizon) ? Math.max(120, Math.min(5400, rawHorizon)) : 600;
    const data = await getIssTrail(horizon);
    res.setHeader('Cache-Control', PROXY_CACHE_HEADER);
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

router.get('/now', issNowHandler);
router.get('/trail', issTrailHandler);

export default router;
