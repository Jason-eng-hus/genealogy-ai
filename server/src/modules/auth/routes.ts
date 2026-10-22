import { Router } from 'express';
import type { AuthConfig } from '../../config/auth.ts';
import type { SecurityConfig } from '../../config/security.ts';
import { AppError } from '../../lib/errors.ts';
import { asyncHandler, sendSuccess } from '../../lib/http.ts';
import { getAuth, requireAuth } from '../../middleware/auth.ts';
import { requireTrustedRequest } from '../../middleware/security.ts';
import { validateBody } from '../../middleware/validate.ts';
import {
  createAuditRequestContext,
} from '../../services/audit.ts';
import { clearSessionCookie, setSessionCookie } from './cookie.ts';
import type { LoginRateLimiter } from './rate-limit.ts';
import { changePasswordSchema, loginSchema } from './schemas.ts';
import {
  changeOwnPassword,
  login,
  logout,
  type ChangePasswordInput,
  type LoginInput,
} from './service.ts';

export interface CreateAuthRouterOptions {
  authConfig: AuthConfig;
  security: SecurityConfig;
  rateLimiter: LoginRateLimiter;
}

function rateLimitKey(req: {
  ip?: string;
  socket: { remoteAddress?: string };
}): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createAuthRouter(
  options: CreateAuthRouterOptions,
): Router {
  const router = Router();
  const authMiddleware = requireAuth(options.authConfig);
  const trustedRequest = requireTrustedRequest(options.security);

  router.post(
    '/login',
    trustedRequest,
    validateBody(loginSchema),
    asyncHandler(async (req, res) => {
      const key = rateLimitKey(req);
      const limit = options.rateLimiter.check(key);

      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSeconds));
        throw new AppError(
          'RATE_LIMITED',
          '登录尝试过于频繁，请稍后再试。',
        );
      }

      const input = req.body as LoginInput;

      try {
        const result = await login(
          input,
          options.authConfig,
          createAuditRequestContext(req, res),
        );

        options.rateLimiter.reset(key);
        setSessionCookie(res, result.token, options.authConfig);
        sendSuccess(res, { user: result.user });
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === 'AUTH_REQUIRED'
        ) {
          options.rateLimiter.recordFailure(key);
        }

        throw error;
      }
    }),
  );

  router.post(
    '/logout',
    trustedRequest,
    authMiddleware,
    asyncHandler(async (req, res) => {
      const auth = getAuth(req);

      await logout(
        { id: auth.user.id, role: auth.role },
        createAuditRequestContext(req, res),
      );
      clearSessionCookie(res, options.authConfig);
      sendSuccess(res, null);
    }),
  );

  router.get('/me', authMiddleware, (req, res) => {
    sendSuccess(res, { user: getAuth(req).user });
  });

  router.post(
    '/change-password',
    trustedRequest,
    authMiddleware,
    validateBody(changePasswordSchema),
    asyncHandler(async (req, res) => {
      const input = req.body as ChangePasswordInput;

      await changeOwnPassword(
        getAuth(req).user.id,
        input,
        createAuditRequestContext(req, res),
      );
      clearSessionCookie(res, options.authConfig);
      sendSuccess(res, null);
    }),
  );

  return router;
}
