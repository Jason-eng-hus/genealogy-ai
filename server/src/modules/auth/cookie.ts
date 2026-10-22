import type { CookieOptions, Response } from 'express';
import type { AuthConfig } from '../../config/auth.ts';

function sessionCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.jwtExpiresInSeconds * 1000,
  };
}

export function setSessionCookie(
  res: Response,
  token: string,
  config: AuthConfig,
): void {
  res.cookie(config.cookieName, token, sessionCookieOptions(config));
}

export function clearSessionCookie(
  res: Response,
  config: AuthConfig,
): void {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
  });
}
