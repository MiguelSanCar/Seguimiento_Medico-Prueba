import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Limpiar entradas expiradas cada minuto
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = store.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.rateLimit.windowMs };
    store.set(ip, entry);
  }

  entry.count++;

  res.setHeader('X-RateLimit-Limit', config.rateLimit.max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimit.max - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > config.rateLimit.max) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  next();
}
