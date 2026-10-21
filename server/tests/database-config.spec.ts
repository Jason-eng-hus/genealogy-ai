import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DATABASE_BUSY_TIMEOUT_MS,
  DatabaseConfigError,
  PROJECT_ROOT,
  SCHEMA_DIR,
  loadDatabaseConfig,
  loadEnvFile,
  resolveDatabaseConfig,
  type DatabaseConfigErrorCode,
} from '../src/config/env.ts';
import { TEST_TMP_DIR } from './support/temp-database.ts';

const fixtureFiles: string[] = [];
let fixtureSequence = 0;

function writeEnvFixture(content: string): string {
  mkdirSync(TEST_TMP_DIR, { recursive: true });

  fixtureSequence += 1;
  const filePath = path.join(
    TEST_TMP_DIR,
    `env-${process.pid}-${Date.now()}-${fixtureSequence}.env`,
  );
  writeFileSync(filePath, content, 'utf8');
  fixtureFiles.push(filePath);

  return filePath;
}

function captureConfigError(action: () => unknown): DatabaseConfigError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseConfigError);
    return error as DatabaseConfigError;
  }

  throw new Error('Expected a DatabaseConfigError to be thrown');
}

function expectConfigError(
  action: () => unknown,
  code: DatabaseConfigErrorCode,
): DatabaseConfigError {
  const error = captureConfigError(action);
  expect(error.code).toBe(code);
  return error;
}

afterAll(() => {
  for (const filePath of fixtureFiles) {
    rmSync(filePath, { force: true });
  }
});

describe('database config resolution', () => {
  it('uses development defaults and the fixed busy timeout', () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: 'file:../../data/genealogy.db',
      BUSY_TIMEOUT_MS: '1',
    });

    expect(config.appEnv).toBe('development');
    expect(config.busyTimeoutMs).toBe(DATABASE_BUSY_TIMEOUT_MS);
    expect(config.busyTimeoutMs).toBe(5000);
    expect(config.databaseFilePath).toBe(
      path.join(PROJECT_ROOT, 'data', 'genealogy.db'),
    );
    expect(config.databaseUrl).toBe('file:../../data/genealogy.db');
  });

  it('resolves relative paths against the Prisma schema directory', () => {
    const config = resolveDatabaseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./.tmp/relative.db',
    });

    expect(config.databaseFilePath).toBe(
      path.join(SCHEMA_DIR, '.tmp', 'relative.db'),
    );
  });

  it('keeps query parameters in the URL but not in the file path', () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: 'file:./.tmp/query.db?connection_limit=1&busy_timeout=999',
    });

    expect(config.databaseUrl).toContain('?connection_limit=1');
    expect(config.databaseFilePath).toBe(
      path.join(SCHEMA_DIR, '.tmp', 'query.db'),
    );
    expect(config.databaseFilePath).not.toContain('?');
  });

  it('supports paths that contain spaces', () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: 'file:./.tmp/with space/family tree.db',
    });

    expect(config.databaseFilePath).toBe(
      path.join(SCHEMA_DIR, '.tmp', 'with space', 'family tree.db'),
    );
  });

  it.skipIf(process.platform !== 'win32')(
    'supports Windows absolute paths and slash-prefixed drive paths',
    () => {
      const rawPath = 'C:\\Users\\Test User\\genealogy data\\family.db';

      const direct = resolveDatabaseConfig({
        DATABASE_URL: `file:${rawPath}`,
      });
      const slashPrefixed = resolveDatabaseConfig({
        DATABASE_URL: `file:///C:/Users/Test User/genealogy data/family.db`,
      });

      expect(direct.databaseFilePath).toBe(path.normalize(rawPath));
      expect(slashPrefixed.databaseFilePath).toBe(path.normalize(rawPath));
    },
  );

  it.skipIf(process.platform === 'win32')(
    'supports POSIX absolute paths',
    () => {
      const config = resolveDatabaseConfig({
        DATABASE_URL: 'file:/var/lib/genealogy/family.db',
      });

      expect(config.databaseFilePath).toBe(
        path.normalize('/var/lib/genealogy/family.db'),
      );
    },
  );

  it('rejects a missing DATABASE_URL', () => {
    expectConfigError(
      () => resolveDatabaseConfig({ NODE_ENV: 'test' }),
      'DATABASE_URL_MISSING',
    );
  });

  it('rejects non-file database URLs without echoing the value', () => {
    const error = expectConfigError(
      () =>
        resolveDatabaseConfig({
          DATABASE_URL: 'postgresql://secret-host/genealogy',
        }),
      'DATABASE_URL_NOT_FILE',
    );

    expect(error.message).not.toContain('secret-host');
  });

  it('rejects an empty file path', () => {
    expectConfigError(
      () => resolveDatabaseConfig({ DATABASE_URL: 'file:' }),
      'DATABASE_URL_EMPTY_PATH',
    );
  });

  it('rejects in-memory SQLite databases', () => {
    expectConfigError(
      () => resolveDatabaseConfig({ DATABASE_URL: 'file::memory:' }),
      'DATABASE_URL_IN_MEMORY',
    );
  });

  it('rejects an invalid NODE_ENV', () => {
    const error = expectConfigError(
      () =>
        resolveDatabaseConfig({
          NODE_ENV: 'staging',
          DATABASE_URL: 'file:./.tmp/dev.db',
        }),
      'NODE_ENV_INVALID',
    );

    expect(error.message).toContain('development, test, production');
  });

  it('rejects a drive-relative Windows path', () => {
    expectConfigError(
      () => resolveDatabaseConfig({ DATABASE_URL: 'file:C:relative.db' }),
      'DATABASE_URL_INVALID',
    );
  });

  it('rejects paths containing a NUL character', () => {
    expectConfigError(
      () =>
        resolveDatabaseConfig({
          DATABASE_URL: 'file:./.tmp/bad\0name.db',
        }),
      'DATABASE_URL_INVALID',
    );
  });
});

describe('environment file loading', () => {
  it('does not override existing variables and fills missing ones', () => {
    const envPath = writeEnvFixture(
      [
        '# fixture',
        'DATABASE_URL="file:./.tmp/from-dotenv.db"',
        'NODE_ENV=test',
        'EXTRA_FLAG=from-dotenv',
      ].join('\n'),
    );
    const target: NodeJS.ProcessEnv = {
      DATABASE_URL: 'file:./.tmp/from-process.db',
    };

    loadEnvFile(envPath, target);

    expect(target.DATABASE_URL).toBe('file:./.tmp/from-process.db');
    expect(target.NODE_ENV).toBe('test');
    expect(target.EXTRA_FLAG).toBe('from-dotenv');
  });

  it('treats a missing environment file as a no-op', () => {
    const target: NodeJS.ProcessEnv = {};

    expect(() =>
      loadEnvFile(path.join(TEST_TMP_DIR, 'missing-env-file.env'), target),
    ).not.toThrow();
    expect(target).toEqual({});
  });

  it('loads a custom environment file through loadDatabaseConfig', () => {
    const envPath = writeEnvFixture(
      ['NODE_ENV=test', 'DATABASE_URL="file:./.tmp/from-dotenv.db"'].join(
        '\n',
      ),
    );

    const config = loadDatabaseConfig({ dotEnvPath: envPath, env: {} });

    expect(config.appEnv).toBe('test');
    expect(config.databaseFilePath).toBe(
      path.join(SCHEMA_DIR, '.tmp', 'from-dotenv.db'),
    );
  });

  it('can skip environment file loading explicitly', () => {
    const envPath = writeEnvFixture(
      'DATABASE_URL="file:./.tmp/from-dotenv.db"',
    );

    expectConfigError(
      () =>
        loadDatabaseConfig({
          dotEnvPath: envPath,
          env: {},
          loadDotEnvFile: false,
        }),
      'DATABASE_URL_MISSING',
    );
  });
});
