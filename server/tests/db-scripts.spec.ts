import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ResetError, assertResetTarget } from '../../scripts/db-reset.ts';
import {
  TEST_TMP_DIR,
  createEmptyDatabase,
  createTempDatabase,
} from './support/temp-database.ts';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const scriptSentinels: string[] = [];

interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
  output: string;
}

function runDbScript(
  scriptName: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ScriptResult {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      path.join(PROJECT_ROOT, 'scripts', scriptName),
      ...args,
    ],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: 60000,
    },
  );

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  return {
    status: result.status,
    stdout,
    stderr,
    output: `${stdout}\n${stderr}`,
  };
}

function readAppliedMigrationCount(filePath: string): number {
  const database = new DatabaseSync(filePath);

  try {
    const row = database
      .prepare(
        'SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
      )
      .get() as { count: number };

    return Number(row.count);
  } finally {
    database.close();
  }
}

function captureResetError(action: () => unknown): ResetError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ResetError);
    return error as ResetError;
  }

  throw new Error('Expected a ResetError to be thrown');
}

afterAll(() => {
  for (const filePath of scriptSentinels) {
    rmSync(filePath, { force: true });
  }
});

describe('database scripts', () => {
  it('migrates an empty database and verifies connection settings', () => {
    const database = createEmptyDatabase('script-migrate');

    try {
      const result = runDbScript('db-migrate.ts', [], {
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(0);
      expect(result.output).toContain('[db:migrate] applying migrations...');
      expect(result.output).toContain('journal_mode=wal');
      expect(result.output).toContain('foreign_keys=on');
      expect(result.output).toContain('busy_timeout=5000');
      expect(result.output).toContain('[db:migrate] OK');
      expect(existsSync(database.filePath)).toBe(true);
      expect(readAppliedMigrationCount(database.filePath)).toBeGreaterThanOrEqual(1);
    } finally {
      database.cleanup();
    }
  });

  it('checks a migrated database successfully', () => {
    const database = createTempDatabase('script-check');

    try {
      const result = runDbScript('db-check.ts', [], {
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(0);
      expect(result.output).toContain('[db:check] journal_mode=wal');
      expect(result.output).toContain('[db:check] foreign_keys=on');
      expect(result.output).toContain('[db:check] busy_timeout=5000');
      expect(result.output).toContain('[db:check] OK');
      expect(result.output).not.toContain(PROJECT_ROOT);
    } finally {
      database.cleanup();
    }
  });

  it('fails the check for an unmigrated database with a stable error code', () => {
    const database = createEmptyDatabase('script-check-unmigrated');

    try {
      const result = runDbScript('db-check.ts', [], {
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain('MIGRATIONS_MISSING');
      expect(result.output).not.toContain(PROJECT_ROOT);
    } finally {
      database.cleanup();
    }
  });

  it('refuses reset without confirmation in non-interactive mode', () => {
    const database = createTempDatabase('script-reset-no-confirm');

    try {
      const result = runDbScript('db-reset.ts', [], {
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain('RESET_CONFIRMATION_REQUIRED');
      expect(existsSync(database.filePath)).toBe(true);
    } finally {
      database.cleanup();
    }
  });

  it('refuses reset when NODE_ENV is production', () => {
    const database = createTempDatabase('script-reset-production');

    try {
      const result = runDbScript('db-reset.ts', ['--confirm=RESET'], {
        NODE_ENV: 'production',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain('RESET_PRODUCTION_FORBIDDEN');
      expect(existsSync(database.filePath)).toBe(true);
    } finally {
      database.cleanup();
    }
  });

  it('recreates the database on a confirmed reset without touching other files', () => {
    const database = createTempDatabase('script-reset-confirm');
    const sentinelPath = path.join(
      TEST_TMP_DIR,
      `reset-sentinel-${process.pid}-${Date.now()}.txt`,
    );

    writeFileSync(sentinelPath, 'untouched', 'utf8');
    scriptSentinels.push(sentinelPath);

    try {
      const result = runDbScript('db-reset.ts', ['--confirm=RESET'], {
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(0);
      expect(result.output).toContain('[db:reset] reset complete');
      expect(result.output).toContain('journal_mode=wal');
      expect(existsSync(database.filePath)).toBe(true);
      expect(readAppliedMigrationCount(database.filePath)).toBeGreaterThanOrEqual(1);
      expect(existsSync(sentinelPath)).toBe(true);
    } finally {
      database.cleanup();
    }
  });
});

describe('reset target guard', () => {
  it('accepts a database file inside the project', () => {
    expect(() =>
      assertResetTarget(path.join(TEST_TMP_DIR, 'guarded.db')),
    ).not.toThrow();
  });

  it('rejects a target outside the project directory', () => {
    const outsidePath = path.join(
      path.dirname(PROJECT_ROOT),
      `outside-${process.pid}.db`,
    );
    const error = captureResetError(() => assertResetTarget(outsidePath));

    expect(error.code).toBe('RESET_TARGET_OUTSIDE_PROJECT');
  });

  it('rejects a target that is not a database file', () => {
    const error = captureResetError(() =>
      assertResetTarget(path.join(TEST_TMP_DIR, 'not-a-database.txt')),
    );

    expect(error.code).toBe('RESET_TARGET_NOT_DATABASE_FILE');
  });
});
