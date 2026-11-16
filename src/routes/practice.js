import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateCoordinates } from '../validators.js';
import { getIssPositionAtTimestamp } from '../lib/issApi.js';
import { calculateHaversineDistanceKm } from '../domain/gameLogic.js';
import { AppError } from '../lib/errors.js';

const router = Router();

const PRACTICE_HORIZON_SECONDS = 600; // 10 menit ke depan
const PRACTICE_EDUCATIONAL_NOTE =
  'ISS bergerak ke timur sekitar 39° bujur (~4.600 km) dalam 10 menit pada kemiringan 51,6°.';

/**
 * POST /api/practice
 * Menghitung jarak tebakan pemain pada mode latihan secara murni tanpa menulis ke database.
 * Tidak mengubah level, progres, statistik, atau papan peringkat.
 */
export async function practiceGuessHandler(req, res, next) {
  try {
    const coords = validateCoordinates(req.body?.lat, req.body?.lng);

    const nowSec = Math.floor(Date.now() / 1000);
    const targetTs = nowSec + PRACTICE_HORIZON_SECONDS;

    let answer;
    try {
      const pos = await getIssPositionAtTimestamp(targetTs);
      answer = {
        lat: pos.latitude,
        lng: pos.longitude,
      };
    } catch {
      throw AppError.badGateway(
        'Gagal menghubungi API ISS untuk memverifikasi posisi latihan.',
        'UPSTREAM_ERROR',
      );
    }

    const distanceKm = Number(
      calculateHaversineDistanceKm(coords.lat, coords.lng, answer.lat, answer.lng).toFixed(1),
    );

    return res.json({
      ok: true,
      data: {
        answer,
        distanceKm,
        message: PRACTICE_EDUCATIONAL_NOTE,
      },
    });
  } catch (err) {
    return next(err);
  }
}

router.post('/', requireAuth, practiceGuessHandler);

export default router;
