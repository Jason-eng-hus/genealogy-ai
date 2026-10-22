import type { z } from 'zod';
import { AppError } from './errors.ts';

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map((part) => String(part)).join('.'),
      message: issue.message,
      code: issue.code,
    }));

    throw new AppError('VALIDATION_ERROR', 'Request input is invalid.', {
      details: { issues },
    });
  }

  return result.data;
}
