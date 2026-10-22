export interface ApiEnvelope<T> {
  code: string;
  message: string;
  data: T;
}

export interface ApiErrorEnvelope {
  code?: unknown;
  message?: unknown;
  data?: unknown;
  requestId?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    'data' in value
  );
}
