/**
 * Request Logger Middleware
 */
import type { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../../config/logger.js';

const logger = getLogger().child({ middleware: 'request-logger' });

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        ip: req.ip,
      },
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
    );
  });

  next();
}
