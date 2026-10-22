import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { parseInput } from '../lib/validation.ts';

export function validateBody<T>(schema: z.ZodType<T>): RequestHandler {
  return (req, _res, next): void => {
    try {
      req.body = parseInput(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParams<T extends Record<string, string>>(
  schema: z.ZodType<T>,
): RequestHandler {
  return (req, _res, next): void => {
    try {
      req.params = parseInput(schema, req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}
