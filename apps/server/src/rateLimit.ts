import type { NextFunction, Request, Response } from 'express';

/** Tiny fixed-window in-memory limiter (per IP). Enough for a single-node game server. */
export function rateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const t = now();
    const entry = hits.get(key);
    if (!entry || t >= entry.reset) {
      hits.set(key, { count: 1, reset: t + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - t) / 1000)));
      res.status(429).json({ error: 'rate_limited', message: 'Too many commands, slow down.' });
      return;
    }
    next();
  };
}
