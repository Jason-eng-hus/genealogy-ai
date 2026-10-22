import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  hasPermission,
  type Permission,
} from '../../../shared/src/constants/permissions.ts';
import { AppError } from '../lib/errors.ts';
import { getAuth } from './auth.ts';

export function requirePermission(
  permission: Permission,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const auth = getAuth(req);

      if (!hasPermission(auth.role, permission)) {
        throw new AppError('FORBIDDEN', '无权访问该资源。');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
