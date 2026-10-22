import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AuthConfigError,
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  DEFAULT_SESSION_COOKIE_NAME,
  EXAMPLE_JWT_SECRET,
  loadAuthConfig,
  resolveAuthConfig,
  type AuthConfigErrorCode,
} from '../src/config/auth.ts';
import { PROJECT_ROOT } from '../src/config/env.ts';

const SECRET = 'test-auth-secret-0123456789abcdef';
const ENV_FILE_DIR = path.join(
  PROJECT_ROOT,
  'server',
  'prisma',
  '.tmp',
  'auth-config',
);
const ENV_FILE_PATH = path.join(ENV_FILE_DIR, `auth-${process.pid}.env`);

function expectAuthConfigError(
  run: () => unknown,
  code: AuthConfigErrorCode,
): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthConfigError);
    expect((error as AuthConfigError).code).toBe(code);
    return;
  }

  throw new Error('Expected an AuthConfigError to be thrown.');
}

afterAll(() => {
  rmSync(ENV_FILE_DIR, { recursive: true, force: true });
});

describe('auth configuration', () => {
  it('requires JWT_SECRET', () => {
    expectAuthConfigError(
      () => resolveAuthConfig({ NODE_ENV: 'test' }),
      'JWT_SECRET_MISSING',
    );
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expectAuthConfigError(
      () =>
        resolveAuthConfig({
          NODE_ENV: 'test',
          JWT_SECRET: 'x'.repeat(31),
        }),
      'JWT_SECRET_TOO_SHORT',
    );
  });

  it('applies safe defaults for expiry and cookie settings', () => {
    const config = resolveAuthConfig({
      NODE_ENV: 'test',
      JWT_SECRET: SECRET,
    });

    expect(config.appEnv).toBe('test');
    expect(config.jwtSecret).toBe(SECRET);
    expect(config.jwtExpiresInSeconds).toBe(
      DEFAULT_JWT_EXPIRES_IN_SECONDS,
    );
    expect(config.cookieName).toBe(DEFAULT_SESSION_COOKIE_NAME);
    expect(config.cookieSecure).toBe(false);
  });

  it.each([
    ['90s', 90],
    ['30m', 30 * 60],
    ['2h', 2 * 60 * 60],
    ['7d', 7 * 24 * 60 * 60],
    ['120', 120],
  ])('parses JWT_EXPIRES_IN value %s', (value, expectedSeconds) => {
    const config = resolveAuthConfig({
      NODE_ENV: 'test',
      JWT_SECRET: SECRET,
      JWT_EXPIRES_IN: value,
    });

    expect(config.jwtExpiresInSeconds).toBe(expectedSeconds);
  });

  it.each(['0s', '30s', '7 hours', '31d', '-1h'])(
    'rejects invalid JWT_EXPIRES_IN value %s',
    (value) => {
      expectAuthConfigError(
        () =>
          resolveAuthConfig({
            NODE_ENV: 'test',
            JWT_SECRET: SECRET,
            JWT_EXPIRES_IN: value,
          }),
        'JWT_EXPIRES_IN_INVALID',
      );
    },
  );

  it('accepts COOKIE_SECURE=true outside production', () => {
    const config = resolveAuthConfig({
      NODE_ENV: 'development',
      JWT_SECRET: SECRET,
      COOKIE_SECURE: 'true',
    });

    expect(config.cookieSecure).toBe(true);
  });

  it('rejects an invalid COOKIE_SECURE value', () => {
    expectAuthConfigError(
      () =>
        resolveAuthConfig({
          NODE_ENV: 'test',
          JWT_SECRET: SECRET,
          COOKIE_SECURE: 'yes',
        }),
      'COOKIE_SECURE_INVALID',
    );
  });

  it('requires secure cookies in production', () => {
    expectAuthConfigError(
      () =>
        resolveAuthConfig({
          NODE_ENV: 'production',
          JWT_SECRET: SECRET,
          COOKIE_SECURE: 'false',
        }),
      'COOKIE_SECURE_REQUIRED',
    );
  });

  it('rejects the example JWT_SECRET in production', () => {
    expectAuthConfigError(
      () =>
        resolveAuthConfig({
          NODE_ENV: 'production',
          JWT_SECRET: EXAMPLE_JWT_SECRET,
          COOKIE_SECURE: 'true',
        }),
      'JWT_SECRET_PLACEHOLDER',
    );
  });

  it('accepts a custom secret with secure cookies in production', () => {
    const config = resolveAuthConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-0123456789abcdef',
      COOKIE_SECURE: 'true',
    });

    expect(config.appEnv).toBe('production');
    expect(config.cookieSecure).toBe(true);
  });

  it('allows the example secret outside production', () => {
    const config = resolveAuthConfig({
      NODE_ENV: 'development',
      JWT_SECRET: EXAMPLE_JWT_SECRET,
    });

    expect(config.jwtSecret).toBe(EXAMPLE_JWT_SECRET);
  });

  it('loads values from a dotenv file without overriding the environment', () => {
    mkdirSync(ENV_FILE_DIR, { recursive: true });
    writeFileSync(
      ENV_FILE_PATH,
      [
        'NODE_ENV=test',
        'JWT_SECRET=from-file-secret-0123456789abcdef',
        'JWT_EXPIRES_IN=45m',
        'COOKIE_SECURE=false',
      ].join('\n'),
      'utf8',
    );

    const fromFile = loadAuthConfig({
      env: {},
      dotEnvPath: ENV_FILE_PATH,
    });

    expect(fromFile.jwtSecret).toBe(
      'from-file-secret-0123456789abcdef',
    );
    expect(fromFile.jwtExpiresInSeconds).toBe(45 * 60);

    const fromEnvironment = loadAuthConfig({
      env: {
        NODE_ENV: 'test',
        JWT_SECRET: SECRET,
        JWT_EXPIRES_IN: '2h',
        COOKIE_SECURE: 'false',
      },
      dotEnvPath: ENV_FILE_PATH,
    });

    expect(fromEnvironment.jwtSecret).toBe(SECRET);
    expect(fromEnvironment.jwtExpiresInSeconds).toBe(2 * 60 * 60);
  });
});
