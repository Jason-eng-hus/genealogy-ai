import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { AuthConfig } from './config/auth.ts';
import type { AppConfig } from './config/env.ts';
import type { SecurityConfig } from './config/security.ts';
import {
  createErrorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from './lib/http.ts';
import { createRequestLogger } from './lib/logger.ts';
import type { DatabaseProbeResult } from './lib/prisma.ts';
import { apiResponseHeaders } from './middleware/security.ts';
import { createAuditRouter } from './modules/audit/routes.ts';
import { createLoginRateLimiter, type LoginRateLimiter } from './modules/auth/rate-limit.ts';
import { createAuthRouter } from './modules/auth/routes.ts';
import { createDashboardRouter } from './modules/dashboard/routes.ts';
import { createUsersRouter } from './modules/users/routes.ts';
import { createHealthRouter } from './routes/health.ts';

export interface CreateAppOptions {
  config: AppConfig;
  auth: AuthConfig;
  security: SecurityConfig;
  logger: Logger;
  probeDatabase?: () => Promise<DatabaseProbeResult>;
  loginRateLimiter?: LoginRateLimiter;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', options.config.server.trustProxy);

  app.use(requestIdMiddleware());
  app.use(helmet());
  app.use(createRequestLogger({ logger: options.logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', apiResponseHeaders());

  app.use(
    '/api/v1/health',
    createHealthRouter({ probe: options.probeDatabase }),
  );
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      authConfig: options.auth,
      security: options.security,
      rateLimiter:
        options.loginRateLimiter ?? createLoginRateLimiter(),
    }),
  );
  app.use(
    '/api/v1/dashboard',
    createDashboardRouter({ authConfig: options.auth }),
  );
  app.use(
    '/api/v1/audit-logs',
    createAuditRouter({ authConfig: options.auth }),
  );
  app.use(
    '/api/v1/users',
    createUsersRouter({
      authConfig: options.auth,
      security: options.security,
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger: options.logger }));

  return app;
}
