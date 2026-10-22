import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { resolveAuthConfig } from '../src/config/auth.ts';
import {
  PROJECT_ROOT,
  resolveAppConfig,
  type AppConfig,
} from '../src/config/env.ts';
import { resolveSecurityConfig } from '../src/config/security.ts';
import { createLogger } from '../src/lib/logger.ts';
import {
  closeDatabase,
  initializeDatabase,
  probeDatabase,
} from '../src/lib/prisma.ts';
import {
  createTempDatabase,
  type TempDatabase,
} from './support/temp-database.ts';

const packageManifest = JSON.parse(
  readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
) as { version: string };

interface HealthResponseBody {
  code: string;
  message: string;
  data: {
    status: string;
    version: string;
    uptimeSeconds: number;
    timestamp: string;
    database: {
      status: string;
      latencyMs?: number;
      journalMode?: string;
      foreignKeys?: boolean;
      busyTimeoutMs?: number;
      migrationCount?: number;
    };
  };
  requestId?: string;
}

let database: TempDatabase;
let config: AppConfig;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = createTempDatabase('health');
  config = resolveAppConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: database.url,
  });
  const logger = createLogger({ level: 'silent', appEnv: 'test' });

  await initializeDatabase({ config: config.database });
  app = createApp({
    config,
    auth: resolveAuthConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-auth-secret-0123456789abcdef',
    }),
    security: resolveSecurityConfig({ NODE_ENV: 'test' }),
    logger,
  });
});

afterAll(async () => {
  await closeDatabase();
  database.cleanup();
});

describe('health endpoint', () => {
  it('reports database health and version', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'health-check-1')
      .expect(200);

    const body = response.body as HealthResponseBody;

    expect(body.code).toBe('OK');
    expect(body.message).toBe('OK');
    expect(body.data.status).toBe('ok');
    expect(body.data.version).toBe(packageManifest.version);
    expect(Date.parse(body.data.timestamp)).not.toBeNaN();
    expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.data.database).toMatchObject({
      status: 'ok',
      journalMode: 'wal',
      foreignKeys: true,
      busyTimeoutMs: 5000,
    });
    expect(body.data.database.migrationCount).toBeGreaterThanOrEqual(2);
    expect(body.data.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.headers['x-request-id']).toBe('health-check-1');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('probes the database on demand', async () => {
    const result = await probeDatabase();

    expect(result.journalMode).toBe('wal');
    expect(result.foreignKeys).toBe(true);
    expect(result.busyTimeoutMs).toBe(5000);
    expect(result.migrationCount).toBeGreaterThanOrEqual(2);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 when the database probe fails', async () => {
    const failingApp = createApp({
      config,
      auth: resolveAuthConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-auth-secret-0123456789abcdef',
      }),
      security: resolveSecurityConfig({ NODE_ENV: 'test' }),
      logger: createLogger({ level: 'silent', appEnv: 'test' }),
      probeDatabase: async () => {
        throw new Error('probe failed');
      },
    });

    const response = await request(failingApp)
      .get('/api/v1/health')
      .expect(503);

    const body = response.body as HealthResponseBody;

    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Service unavailable.');
    expect(body.data).toMatchObject({
      status: 'degraded',
      database: { status: 'error' },
    });
    expect(body.data.version).toBe(packageManifest.version);
    expect(body.requestId).toBe(response.headers['x-request-id']);
  });

  it('returns 503 after the database is closed', async () => {
    await closeDatabase();

    const response = await request(app)
      .get('/api/v1/health')
      .expect(503);

    const body = response.body as HealthResponseBody;

    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.data.status).toBe('degraded');
    expect(body.data.database.status).toBe('error');
  });
});
