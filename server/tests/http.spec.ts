import { EventEmitter } from 'node:events';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { resolveAppConfig } from '../src/config/env.ts';
import { AppError } from '../src/lib/errors.ts';
import {
  asyncHandler,
  createErrorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from '../src/lib/http.ts';
import { createLogger, createRequestLogger } from '../src/lib/logger.ts';
import { closeDatabase, initializeDatabase } from '../src/lib/prisma.ts';
import {
  createTempDatabase,
  type TempDatabase,
} from './support/temp-database.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let database: TempDatabase;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = createTempDatabase('http');
  const config = resolveAppConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: database.url,
  });
  const logger = createLogger({ level: 'silent', appEnv: 'test' });

  await initializeDatabase({ config: config.database });
  app = createApp({ config, logger });
});

afterAll(async () => {
  await closeDatabase();
  database.cleanup();
});

function createErrorTestApp(): express.Express {
  const logger = createLogger({ level: 'silent', appEnv: 'test' });
  const testApp = express();

  testApp.disable('x-powered-by');
  testApp.use(requestIdMiddleware());
  testApp.get('/conflict', () => {
    throw new AppError('CONFLICT_VERSION', 'Version conflict.', {
      details: { expectedVersion: 2, actualVersion: 1 },
    });
  });
  testApp.get(
    '/async-forbidden',
    asyncHandler(async () => {
      throw new AppError('FORBIDDEN', 'Access denied.');
    }),
  );
  testApp.get('/unknown-error', () => {
    throw new Error('secret database password');
  });
  testApp.use(notFoundHandler);
  testApp.use(createErrorHandler({ logger }));

  return testApp;
}

describe('HTTP envelope and error handling', () => {
  it('returns a stable envelope for unknown routes', async () => {
    const response = await request(app)
      .get('/api/v1/missing')
      .set('X-Request-Id', 'trace-123')
      .expect(404);

    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found.',
      data: null,
      requestId: 'trace-123',
    });
    expect(response.headers['x-request-id']).toBe('trace-123');
  });

  it('generates a request id when the incoming value is invalid', async () => {
    const response = await request(app)
      .get('/api/v1/missing')
      .set('X-Request-Id', 'bad id!')
      .expect(404);

    const requestId = response.headers['x-request-id'];

    expect(requestId).toMatch(UUID_PATTERN);
    expect(requestId).not.toBe('bad id!');
    expect(response.body.requestId).toBe(requestId);
  });

  it('maps malformed JSON to a 400 validation error', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('maps oversized JSON bodies to 413', async () => {
    const oversized = JSON.stringify({
      payload: 'x'.repeat(1024 * 1024 + 1024),
    });

    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(oversized)
      .expect(413);

    expect(response.body.code).toBe('UPLOAD_TOO_LARGE');
  });

  it('maps AppError instances to their stable code and status', async () => {
    const response = await request(createErrorTestApp())
      .get('/conflict')
      .expect(409);

    expect(response.body).toMatchObject({
      code: 'CONFLICT_VERSION',
      message: 'Version conflict.',
      data: { expectedVersion: 2, actualVersion: 1 },
    });
    expect(response.body.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('catches rejected async handlers', async () => {
    const response = await request(createErrorTestApp())
      .get('/async-forbidden')
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('hides internal error details and returns 500', async () => {
    const response = await request(createErrorTestApp())
      .get('/unknown-error')
      .expect(500);

    expect(response.body.code).toBe('INTERNAL_ERROR');
    expect(response.body.message).toBe('Internal server error.');
    expect(response.body.requestId).toBeDefined();
    expect(response.text).not.toContain('secret database password');
  });

  it('applies security headers and hides X-Powered-By', async () => {
    const response = await request(app).get('/api/v1/missing').expect(404);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('logger redaction', () => {
  it('redacts credentials, cookies and API keys', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      appEnv: 'test',
      destination: {
        write(message: string): void {
          lines.push(message);
        },
      },
    });

    logger.info(
      {
        password: 'password-secret',
        nested: {
          token: 'token-secret',
          apiKey: 'api-key-secret',
        },
        req: {
          headers: {
            authorization: 'Bearer authorization-secret',
            cookie: 'cookie-secret',
          },
        },
        AI_API_KEY: 'ai-api-key-secret',
        JWT_SECRET: 'jwt-secret',
      },
      'redaction test',
    );

    const output = lines.join('');

    for (const secret of [
      'password-secret',
      'token-secret',
      'api-key-secret',
      'authorization-secret',
      'cookie-secret',
      'ai-api-key-secret',
      'jwt-secret',
    ]) {
      expect(output).not.toContain(secret);
    }

    expect(output).toContain('[REDACTED]');
  });

  it('does not log query strings or request headers', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      appEnv: 'test',
      destination: {
        write(message: string): void {
          lines.push(message);
        },
      },
    });
    const req = {
      method: 'GET',
      path: '/ping',
      originalUrl: '/ping?token=query-secret&password=query-password',
      headers: {
        authorization: 'Bearer header-secret',
        cookie: 'cookie-secret',
      },
    };
    const res = new EventEmitter() as EventEmitter & {
      locals: Record<string, unknown>;
      statusCode: number;
    };
    res.locals = { requestId: 'req-1' };
    res.statusCode = 200;

    const next = vi.fn();
    createRequestLogger({ logger })(
      req as never,
      res as never,
      next,
    );

    expect(next).toHaveBeenCalledOnce();

    res.emit('finish');

    const output = lines.join('');

    expect(output).toContain('"requestId":"req-1"');
    expect(output).toContain('"path":"/ping"');
    expect(output).toContain('"statusCode":200');
    expect(output).not.toContain('query-secret');
    expect(output).not.toContain('query-password');
    expect(output).not.toContain('header-secret');
    expect(output).not.toContain('cookie-secret');
  });
});
