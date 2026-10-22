export const DEFAULT_LOGIN_RATE_LIMIT_MAX_FAILURES = 10;
export const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 5_000;

export interface LoginRateLimitOptions {
  maxFailures?: number;
  windowMs?: number;
  now?: () => number;
}

export interface LoginRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface LoginRateLimiter {
  check: (key: string) => LoginRateLimitResult;
  recordFailure: (key: string) => void;
  reset: (key: string) => void;
  clear: () => void;
}

interface Bucket {
  failures: number;
  resetAt: number;
}

function resolvePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;

  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }

  return resolved;
}

export function createLoginRateLimiter(
  options: LoginRateLimitOptions = {},
): LoginRateLimiter {
  const maxFailures = resolvePositiveInteger(
    options.maxFailures,
    DEFAULT_LOGIN_RATE_LIMIT_MAX_FAILURES,
    'maxFailures',
  );
  const windowMs = resolvePositiveInteger(
    options.windowMs,
    DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
    'windowMs',
  );
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  const pruneExpired = (currentTime: number): void => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) {
        buckets.delete(key);
      }
    }
  };

  const getActiveBucket = (
    key: string,
    currentTime: number,
  ): Bucket | undefined => {
    const bucket = buckets.get(key);

    if (bucket === undefined) {
      return undefined;
    }

    if (bucket.resetAt <= currentTime) {
      buckets.delete(key);
      return undefined;
    }

    return bucket;
  };

  const check = (key: string): LoginRateLimitResult => {
    const currentTime = now();

    if (buckets.size >= MAX_TRACKED_KEYS) {
      pruneExpired(currentTime);
    }

    const bucket = getActiveBucket(key, currentTime);

    if (bucket === undefined || bucket.failures < maxFailures) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.resetAt - currentTime) / 1000),
      ),
    };
  };

  const recordFailure = (key: string): void => {
    const currentTime = now();
    const bucket = getActiveBucket(key, currentTime);

    if (bucket === undefined) {
      buckets.set(key, {
        failures: 1,
        resetAt: currentTime + windowMs,
      });
      return;
    }

    bucket.failures += 1;
  };

  const reset = (key: string): void => {
    buckets.delete(key);
  };

  const clear = (): void => {
    buckets.clear();
  };

  return { check, recordFailure, reset, clear };
}
