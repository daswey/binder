import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 2000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Rate limit exceeded' },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 2000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Rate limit exceeded' },
});
