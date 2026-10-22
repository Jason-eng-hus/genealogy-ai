import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Router } from 'express';
import { PROJECT_ROOT } from '../config/env.ts';
import { asyncHandler, sendError, sendSuccess } from '../lib/http.ts';
import {
  probeDatabase,
  type DatabaseProbeResult,
} from '../lib/prisma.ts';

interface PackageManifest {
  version?: unknown;
}

function readAppVersion(): string {
  const manifest = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
  ) as PackageManifest;

  return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
}

export const APP_VERSION = readAppVersion();

export interface HealthDatabaseStatus {
  status: 'ok' | 'error';
  latencyMs?: number;
  journalMode?: 'wal';
  foreignKeys?: true;
  busyTimeoutMs?: number;
  migrationCount?: number;
}

export interface HealthPayload {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  database: HealthDatabaseStatus;
}

export interface HealthRouterOptions {
  probe?: () => Promise<DatabaseProbeResult>;
}

export function createHealthRouter(
  options: HealthRouterOptions = {},
): Router {
  const router = express.Router();
  const probe = options.probe ?? probeDatabase;

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');

      try {
        const database = await probe();
        const payload: HealthPayload = {
          status: 'ok',
          version: APP_VERSION,
          uptimeSeconds: Number(process.uptime().toFixed(3)),
          timestamp: new Date().toISOString(),
          database: {
            status: 'ok',
            latencyMs: database.latencyMs,
            journalMode: database.journalMode,
            foreignKeys: database.foreignKeys,
            busyTimeoutMs: database.busyTimeoutMs,
            migrationCount: database.migrationCount,
          },
        };

        sendSuccess(res, payload);
      } catch {
        const payload: HealthPayload = {
          status: 'degraded',
          version: APP_VERSION,
          uptimeSeconds: Number(process.uptime().toFixed(3)),
          timestamp: new Date().toISOString(),
          database: {
            status: 'error',
          },
        };

        sendError(res, 'INTERNAL_ERROR', 'Service unavailable.', {
          status: 503,
          details: payload,
        });
      }
    }),
  );

  return router;
}
