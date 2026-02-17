/**
 * Error Handler Middleware
 * Catches all errors and returns structured JSON responses.
 */
import type { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../../config/logger.js';
import { DomainError } from '../../../domain/errors/index.js';
import { ZodError } from 'zod';

const logger = getLogger().child({ middleware: 'error-handler' });

export interface ApiError {
  status: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Domain errors — expected, map to HTTP status
  if (err instanceof DomainError) {
    const statusMap: Record<string, number> = {
      INSUFFICIENT_LIQUIDITY: 400,
      POOL_NOT_FOUND: 404,
      INTENT_EXPIRED: 400,
      INTENT_NOT_FOUND: 404,
      INVALID_ASSETS: 400,
      SLIPPAGE_EXCEEDED: 400,
      UNAUTHORIZED: 401,
      ORDER_NOT_FOUND: 404,
      CHAIN_ERROR: 502,
    };

    const status = statusMap[err.code] ?? 400;
    logger.warn({ code: err.code, message: err.message }, 'Domain error');

    res.status(status).json({
      status: 'error',
      code: err.code,
      message: err.message,
    } satisfies ApiError);
    return;
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues }, 'Validation error');

    res.status(400).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    } satisfies ApiError);
    return;
  }

  // Unexpected errors — log full stack, return generic message
  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  } satisfies ApiError);
}
