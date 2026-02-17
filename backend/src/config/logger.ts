/**
 * Pino logger — optimized for Render Free Tier (512MB RAM)
 * - Production: JSON only, no pino-pretty (saves ~10MB RAM)
 * - Development: pretty-printed with colors
 */
import pino from 'pino';
import { env } from './env.js';

let _logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (_logger) return _logger;

  _logger = pino({
    level: env.LOG_LEVEL,
    // Only use pino-pretty in dev; raw JSON in prod saves memory
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    serializers: {
      err: pino.stdSerializers.err,
    },
    // Avoid logging entire req/res objects in production
    base: env.NODE_ENV === 'production' ? undefined : {
      service: 'solvernet-backend',
      network: env.CARDANO_NETWORK,
    },
  });

  return _logger;
}
