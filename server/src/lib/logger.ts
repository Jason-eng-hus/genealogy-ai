import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';
import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';
import type { AppEnv, LogLevel } from '../config/env.ts';

export const REDACTED = '[REDACTED]';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'AI_API_KEY',
  'JWT_SECRET',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.accessToken',
  '*.refreshToken',
  '*.AI_API_KEY',
  '*.JWT_SECRET',
  '*.*.authorization',
  '*.*.cookie',
  '*.*.password',
  '*.*.token',
  '*.*.secret',
  '*.*.apiKey',
  '*.*.api_key',
  '*.*.accessToken',
  '*.*.refreshToken',
  '*.*.AI_API_KEY',
  '*.*.JWT_SECRET',
] as const;

export interface CreateLoggerOptions {
  level?: LogLevel;
  appEnv?: AppEnv;
  destination?: DestinationStream;
}

export interface RequestLoggerOptions {
  logger: Logger;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? 'info',
    base: {
      app: 'genealogy-ai',
      env: options.appEnv ?? 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...REDACT_PATHS],
      censor: REDACTED,
    },
  };

  return options.destination
    ? pino(loggerOptions, options.destination)
    : pino(loggerOptions);
}

export function createRequestLogger(
  options: RequestLoggerOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  const { logger } = options;

  return (req, res, next): void => {
    const startedAt = performance.now();
    const pathWithoutQuery = req.originalUrl.split('?')[0];
    const path = pathWithoutQuery === '' ? req.path : pathWithoutQuery;

    res.once('finish', () => {
      const requestId =
        typeof res.locals.requestId === 'string'
          ? res.locals.requestId
          : undefined;
      const durationMs = Math.max(
        0,
        Math.round(performance.now() - startedAt),
      );
      const payload = {
        requestId,
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs,
      };

      if (res.statusCode >= 500) {
        logger.error(payload, 'request completed');
      } else if (res.statusCode >= 400) {
        logger.warn(payload, 'request completed');
      } else {
        logger.info(payload, 'request completed');
      }
    });

    next();
  };
}
