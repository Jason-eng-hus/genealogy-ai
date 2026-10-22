import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../src/config/env.ts';
import {
  DEFAULT_DEV_ALLOWED_ORIGINS,
  SecurityConfigError,
  isAllowedOrigin,
  loadSecurityConfig,
  resolveSecurityConfig,
  type SecurityConfigErrorCode,
} from '../src/config/security.ts';

const ENV_FILE_DIR = path.join(
  PROJECT_ROOT,
  'server',
  'prisma',
  '.tmp',
  'security-config',
);
const ENV_FILE_PATH = path.join(ENV_FILE_DIR, `security-${process.pid}.env`);

function expectSecurityConfigError(
  run: () => unknown,
  code: SecurityConfigErrorCode,
): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SecurityConfigError);
    expect((error as SecurityConfigError).code).toBe(code);
    return;
  }

  throw new Error('Expected a SecurityConfigError to be thrown.');
}

afterAll(() => {
  rmSync(ENV_FILE_DIR, { recursive: true, force: true });
});

describe('security configuration', () => {
  it('uses the Vite development origins by default outside production', () => {
    const development = resolveSecurityConfig({ NODE_ENV: 'development' });
    const test = resolveSecurityConfig({ NODE_ENV: 'test' });

    expect(development.allowedOrigins).toEqual([
      ...DEFAULT_DEV_ALLOWED_ORIGINS,
    ]);
    expect(test.allowedOrigins).toEqual([...DEFAULT_DEV_ALLOWED_ORIGINS]);
  });

  it('defaults to same-origin only in production', () => {
    const config = resolveSecurityConfig({ NODE_ENV: 'production' });

    expect(config.appEnv).toBe('production');
    expect(config.allowedOrigins).toEqual([]);
  });

  it('parses, trims, and deduplicates explicit origins', () => {
    const config = resolveSecurityConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS:
        ' https://genealogy.example.com , https://genealogy.example.com:443 ,http://localhost:8080 ',
    });

    expect(config.allowedOrigins).toEqual([
      'https://genealogy.example.com',
      'http://localhost:8080',
    ]);
  });

  it('rejects the wildcard origin', () => {
    expectSecurityConfigError(
      () =>
        resolveSecurityConfig({
          NODE_ENV: 'test',
          ALLOWED_ORIGINS: '*',
        }),
      'ALLOWED_ORIGINS_INVALID',
    );
  });

  it('rejects malformed origins', () => {
    expectSecurityConfigError(
      () =>
        resolveSecurityConfig({
          NODE_ENV: 'test',
          ALLOWED_ORIGINS: 'not a url',
        }),
      'ALLOWED_ORIGINS_INVALID',
    );
  });

  it('rejects non-http protocols', () => {
    expectSecurityConfigError(
      () =>
        resolveSecurityConfig({
          NODE_ENV: 'test',
          ALLOWED_ORIGINS: 'ftp://example.com',
        }),
      'ALLOWED_ORIGINS_INVALID',
    );
  });

  it('rejects origins containing credentials', () => {
    expectSecurityConfigError(
      () =>
        resolveSecurityConfig({
          NODE_ENV: 'test',
          ALLOWED_ORIGINS: 'https://user:pass@example.com',
        }),
      'ALLOWED_ORIGINS_INVALID',
    );
  });

  it.each([
    'https://example.com/app',
    'https://example.com?query=1',
    'https://example.com#fragment',
  ])('rejects origins with paths, queries, or fragments: %s', (origin) => {
    expectSecurityConfigError(
      () =>
        resolveSecurityConfig({
          NODE_ENV: 'test',
          ALLOWED_ORIGINS: origin,
        }),
      'ALLOWED_ORIGINS_INVALID',
    );
  });

  it('rejects empty entries in the allowlist', () => {
    expectSecurityConfigError(
      () =>
        resolveSecurityConfig({
          NODE_ENV: 'test',
          ALLOWED_ORIGINS: 'https://example.com,,https://other.example.com',
        }),
      'ALLOWED_ORIGINS_INVALID',
    );
  });

  it('accepts configured origins and the current request origin', () => {
    const config = resolveSecurityConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://genealogy.example.com',
    });

    expect(
      isAllowedOrigin(
        'https://genealogy.example.com',
        config,
        'https://genealogy.example.com',
      ),
    ).toBe(true);
    expect(
      isAllowedOrigin(
        'https://genealogy.example.com',
        config,
        'http://127.0.0.1:4000',
      ),
    ).toBe(true);
    expect(
      isAllowedOrigin(
        'https://genealogy.example.com:443',
        config,
        null,
      ),
    ).toBe(true);
    expect(
      isAllowedOrigin(
        'http://internal.example.test',
        config,
        'http://internal.example.test',
      ),
    ).toBe(true);
  });

  it('rejects missing, opaque, malformed, and unlisted origins', () => {
    const config = resolveSecurityConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://genealogy.example.com',
    });

    expect(isAllowedOrigin(undefined, config, 'http://127.0.0.1:4000')).toBe(
      false,
    );
    expect(isAllowedOrigin('null', config, 'http://127.0.0.1:4000')).toBe(
      false,
    );
    expect(
      isAllowedOrigin('not a url', config, 'http://127.0.0.1:4000'),
    ).toBe(false);
    expect(
      isAllowedOrigin(
        'https://attacker.example.com',
        config,
        'http://127.0.0.1:4000',
      ),
    ).toBe(false);
    expect(
      isAllowedOrigin(
        'https://genealogy.example.com/path',
        config,
        'https://genealogy.example.com',
      ),
    ).toBe(false);
  });

  it('loads the allowlist from a dotenv file without overriding the environment', () => {
    mkdirSync(ENV_FILE_DIR, { recursive: true });
    writeFileSync(
      ENV_FILE_PATH,
      [
        'NODE_ENV=test',
        'ALLOWED_ORIGINS=https://from-file.example.com',
      ].join('\n'),
      'utf8',
    );

    const fromFile = loadSecurityConfig({
      env: {},
      dotEnvPath: ENV_FILE_PATH,
    });

    expect(fromFile.allowedOrigins).toEqual([
      'https://from-file.example.com',
    ]);

    const fromEnvironment = loadSecurityConfig({
      env: {
        NODE_ENV: 'test',
        ALLOWED_ORIGINS: 'https://from-env.example.com',
      },
      dotEnvPath: ENV_FILE_PATH,
    });

    expect(fromEnvironment.allowedOrigins).toEqual([
      'https://from-env.example.com',
    ]);
  });
});
