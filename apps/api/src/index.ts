import 'dotenv/config';
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { publicLimiter, authLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import cardRoutes from './routes/cards';
import binderRoutes from './routes/binder';
import matchRoutes from './routes/matches';
import conversationRoutes from './routes/conversations';
import ratingRoutes from './routes/ratings';
import eventRoutes from './routes/events';
import userRoutes from './routes/users';
import feedRoutes from './routes/feed';
import notificationRoutes from './routes/notifications';
import priceAlertRoutes from './routes/price_alerts';
import webhookRoutes from './routes/webhooks';
import gradingRoutes from './routes/grading';
import pushRoutes from './routes/push';
import { initIO } from './sockets/io';
import { startJobs } from './jobs';

const app = express();
const server = http.createServer(app);

app.use(helmet());
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://binder-319w.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, PWA, etc.)
    if (!origin) return cb(null, true);
    // Allow vercel preview deployments and localhost
    if (
      ALLOWED_ORIGINS.some(o => origin === o) ||
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost')
    ) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(publicLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/binder', authLimiter, binderRoutes);
app.use('/api/matches', authLimiter, matchRoutes);
app.use('/api/conversations', authLimiter, conversationRoutes);
app.use('/api/ratings', authLimiter, ratingRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/users', userRoutes);
app.use('/api/feed', authLimiter, feedRoutes);
app.use('/api/notifications', authLimiter, notificationRoutes);
app.use('/api/price-alerts', authLimiter, priceAlertRoutes);
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
app.use('/api/grading', gradingRoutes);
app.use('/api/push', pushRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Image proxy for Bandai card images (their CDN blocks hotlinking without Referer)
app.get('/api/img/bandai', async (req: express.Request, res: express.Response) => {
  const url = req.query.url as string;
  if (!url || !url.startsWith('https://en.onepiece-cardgame.com/images/')) {
    return res.status(400).json({ error: 'BadRequest', message: 'Invalid image URL' });
  }
  try {
    const upstream = await fetch(url, {
      headers: {
        Referer: 'https://en.onepiece-cardgame.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    const ct = upstream.headers.get('content-type') ?? 'image/png';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = await upstream.arrayBuffer();
    return res.send(Buffer.from(buf));
  } catch {
    return res.status(502).end();
  }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: 'InternalError', message: err.message ?? 'Something went wrong' });
});

initIO(server);
startJobs();

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => console.log(`API running on :${PORT}`));
