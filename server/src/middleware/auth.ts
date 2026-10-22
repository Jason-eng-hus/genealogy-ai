import type { Request, RequestHandler } from 'express';
import type { Role } from '../../../shared/src/constants/enums.ts';
import type { AuthConfig } from '../config/auth.ts';
import { AppError } from '../lib/errors.ts';
import { asyncHandler } from '../lib/http.ts';
import { getPrisma } from '../lib/prisma.ts';
import { clearSessionCookie } from '../modules/auth/cookie.ts';
import { verifyPasswordFingerprint } from '../modules/auth/service.ts';
import { verifyAuthToken } from '../modules/auth/token.ts';
import {
  toPublicUser,
  type PublicUser,
} from '../modules/users/service.ts';

export interface AuthContext {
  user: PublicUser;
  role: Role;
}

function readSessionToken(req: Request, cookieName: string): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[cookieName];

  return typeof value === 'string' && value !== '' ? value : null;
}

export function requireAuth(authConfig: AuthConfig): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const token = readSessionToken(req, authConfig.cookieName);

    if (token === null) {
      throw new AppError('AUTH_REQUIRED', '请先登录。');
    }

    const claims = verifyAuthToken(token, {
      secret: authConfig.jwtSecret,
    });

    if (claims === null) {
      clearSessionCookie(res, authConfig);
      throw new AppError('AUTH_REQUIRED', '登录状态已失效，请重新登录。');
    }

    const user = await getPrisma().user.findUnique({
      where: { id: claims.sub },
    });

    if (
      user === null ||
      !user.isActive ||
      !verifyPasswordFingerprint(
        authConfig,
        user.passwordHash,
        claims.pwv,
      )
    ) {
      clearSessionCookie(res, authConfig);
      throw new AppError('AUTH_REQUIRED', '登录状态已失效，请重新登录。');
    }

    const publicUser = toPublicUser(user);
    req.auth = {
      user: publicUser,
      role: publicUser.role,
    };
    next();
  });
}

export function getAuth(req: Request): AuthContext {
  if (req.auth === undefined) {
    throw new AppError('AUTH_REQUIRED', '请先登录。');
  }

  return req.auth;
}
