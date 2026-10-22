import { describe, expect, it } from 'vitest';
import {
  createLoginRateLimiter,
  DEFAULT_LOGIN_RATE_LIMIT_MAX_FAILURES,
  DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
} from '../src/modules/auth/rate-limit.ts';

describe('login rate limiter', () => {
  it('blocks a key after the configured number of failures', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      maxFailures: 3,
      windowMs: 1000,
      now: () => now,
    });

    expect(limiter.check('1.2.3.4')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });

    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('1.2.3.4');
    expect(limiter.check('1.2.3.4').allowed).toBe(true);

    limiter.recordFailure('1.2.3.4');
    expect(limiter.check('1.2.3.4')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it('reports the remaining window in seconds', () => {
    let now = 10_000;
    const limiter = createLoginRateLimiter({
      maxFailures: 1,
      windowMs: 1500,
      now: () => now,
    });

    limiter.recordFailure('key');
    now = 10_900;

    expect(limiter.check('key')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it('allows attempts again after the window expires', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      maxFailures: 1,
      windowMs: 1000,
      now: () => now,
    });

    limiter.recordFailure('key');
    expect(limiter.check('key').allowed).toBe(false);

    now = 1000;
    expect(limiter.check('key').allowed).toBe(true);
  });

  it('resets a key after a successful login', () => {
    const limiter = createLoginRateLimiter({
      maxFailures: 1,
      windowMs: 1000,
    });

    limiter.recordFailure('key');
    expect(limiter.check('key').allowed).toBe(false);

    limiter.reset('key');
    expect(limiter.check('key').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = createLoginRateLimiter({
      maxFailures: 1,
      windowMs: 1000,
    });

    limiter.recordFailure('first');
    expect(limiter.check('first').allowed).toBe(false);
    expect(limiter.check('second').allowed).toBe(true);
  });

  it('clears all tracked keys', () => {
    const limiter = createLoginRateLimiter({
      maxFailures: 1,
      windowMs: 1000,
    });

    limiter.recordFailure('first');
    limiter.recordFailure('second');
    limiter.clear();

    expect(limiter.check('first').allowed).toBe(true);
    expect(limiter.check('second').allowed).toBe(true);
  });

  it('exposes conservative defaults', () => {
    expect(DEFAULT_LOGIN_RATE_LIMIT_MAX_FAILURES).toBe(10);
    expect(DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it.each([
    [{ maxFailures: 0 }],
    [{ maxFailures: 1.5 }],
    [{ windowMs: 0 }],
    [{ windowMs: -1 }],
  ])('rejects invalid options %o', (options) => {
    expect(() => createLoginRateLimiter(options)).toThrow(TypeError);
  });
});
