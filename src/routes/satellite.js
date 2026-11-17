import express from 'express';
import { getSatelliteTrail, calculateSatellitePosition } from '../lib/satelliteApi.js';

const router = express.Router();

// GET /api/satellite/:name/now – current position
router.get('/satellite/:name/now', async (req, res, next) => {
  const { name } = req.params;
  try {
    const pos = await calculateSatellitePosition(name, Date.now());
    res.json(pos);
  } catch (err) {
    next(err);
  }
});

// GET /api/satellite/:name/trail?horizon_seconds=600 – trail positions
router.get('/satellite/:name/trail', async (req, res, next) => {
  const { name } = req.params;
  const horizon = Number(req.query.horizon_seconds) || 600;
  try {
    const trail = await getSatelliteTrail(name, horizon);
    res.json(trail);
  } catch (err) {
    next(err);
  }
});

export default router;

