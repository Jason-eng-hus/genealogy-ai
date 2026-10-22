import { ApiError, request } from './client';
import { isRecord } from './types';

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

export function isHealthPayload(value: unknown): value is HealthPayload {
  if (!isRecord(value)) {
    return false;
  }

  if (value.status !== 'ok' && value.status !== 'degraded') {
    return false;
  }

  if (
    typeof value.version !== 'string' ||
    typeof value.uptimeSeconds !== 'number' ||
    typeof value.timestamp !== 'string'
  ) {
    return false;
  }

  if (!isRecord(value.database)) {
    return false;
  }

  return (
    value.database.status === 'ok' || value.database.status === 'error'
  );
}

export async function fetchHealth(): Promise<HealthPayload> {
  try {
    return await request<HealthPayload>({
      url: '/health',
      method: 'GET',
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 503 &&
      isHealthPayload(error.details)
    ) {
      return error.details;
    }

    throw error;
  }
}
