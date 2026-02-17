/**
 * Rate Limiter Middleware
 */
import rateLimit from 'express-rate-limit';
import { env } from '../../../config/env.js';

export const apiLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later',
  },
});

/** Stricter limiter for write operations (swap, create pool, etc.) */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: Math.floor(env.RATE_LIMIT_MAX / 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many write requests, please try again later',
  },
});
