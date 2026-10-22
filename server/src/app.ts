import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { AppConfig } from './config/env.ts';
import {
  createErrorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from './lib/http.ts';
import { createRequestLogger } from './lib/logger.ts';
import type { DatabaseProbeResult } from './lib/prisma.ts';
import { createHealthRouter } from './routes/health.ts';

export interface CreateAppOptions {
  config: AppConfig;
  logger: Logger;
  probeDatabase?: () => Promise<DatabaseProbeResult>;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', options.config.server.trustProxy);

  app.use(requestIdMiddleware());
  app.use(helmet());
  app.use(createRequestLogger({ logger: options.logger }));
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/api/v1/health',
    createHealthRouter({ probe: options.probeDatabase }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger: options.logger }));

  return app;
}
