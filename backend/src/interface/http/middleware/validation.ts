/**
 * Validation Middleware
 * Validates request body/query/params against Zod schemas.
 */
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      // Replace with parsed+coerced data
      (req as unknown as Record<string, unknown>)[source] = data;
      next();
    } catch (err) {
      next(err);
    }
  };
}
