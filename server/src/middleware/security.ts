import type { Request, RequestHandler } from 'express';
import {
  isAllowedOrigin,
  type SecurityConfig,
} from '../config/security.ts';
import { AppError } from '../lib/errors.ts';

const TRUSTED_REQUEST_MESSAGE = '请求来源未通过校验。';

function requestOrigin(req: Request): string | null {
  const host = req.get('host');

  if (host === undefined || host.trim() === '') {
    return null;
  }

  try {
    return new URL(`${req.protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export function requireTrustedRequest(
  config: SecurityConfig,
): RequestHandler {
  return (req, _res, next): void => {
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
      next(new AppError('FORBIDDEN', TRUSTED_REQUEST_MESSAGE));
      return;
    }

    const origin = req.get('Origin');

    if (!isAllowedOrigin(origin, config, requestOrigin(req))) {
      next(new AppError('FORBIDDEN', TRUSTED_REQUEST_MESSAGE));
      return;
    }

    next();
  };
}

export function apiResponseHeaders(): RequestHandler {
  return (_req, res, next): void => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  };
}
