import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { queryOne } from '../db/client';
import { getFeed } from '../services/feedService';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne(
      `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM users WHERE id=$1 AND location IS NOT NULL`,
      [req.userId]
    );

    if (!user) return res.json({ data: [], next_cursor: null });

    const radiusKm = Math.min(Number(req.query.radius_km) || 25, 100);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    const result = await getFeed({ lat: user.lat, lng: user.lng, radiusKm, limit, cursor });
    return res.json(result);
  } catch (err) {
    console.error('Feed error:', err);
    return res.status(500).json({ error: 'Internal', message: 'Failed to fetch feed' });
  }
});

export default router;
