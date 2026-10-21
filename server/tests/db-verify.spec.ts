import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createBackup } from '../../scripts/backup.ts';
import {
  MIGRATIONS_DIR,
  MigrationVerificationError,
  verifyMigrations,
} from '../../scripts/db-verify.ts';
import {
  createEmptyDatabase,
  createTempDatabase,
  TEST_TMP_DIR,
  type TempDatabase,
} from './support/temp-database.ts';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const tempDirs: string[] = [];
let sequence = 0;

interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
  output: string;
}

function createTempDir(label: string): string {
  sequence += 1;
  const directory = path.join(
    TEST_TMP_DIR,
    `${label}-${process.pid}-${Date.now()}-${sequence}`,
  );
  mkdirSync(directory, { recursive: true });
  tempDirs.push(directory);
  return directory;
}

function runDatabaseScript(
  scriptName: string,
  env: NodeJS.ProcessEnv,
): ScriptResult {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      path.join(PROJECT_ROOT, 'scripts', scriptName),
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

function runDbVerifyCli(env: NodeJS.ProcessEnv): ScriptResult {
  return runDatabaseScript('db-verify.ts', env);
}

function runDbStatusCli(env: NodeJS.ProcessEnv): ScriptResult {
  return runDatabaseScript('db-status.ts', env);
}

function readMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function captureVerificationError(
  action: () => unknown,
): MigrationVerificationError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(MigrationVerificationError);
    return error as MigrationVerificationError;
  }

  throw new Error('Expected a MigrationVerificationError to be thrown');
}

function withLedger(
  databaseFilePath: string,
  action: (database: DatabaseSync) => void,
): void {
  const database = new DatabaseSync(databaseFilePath);

  try {
    action(database);
  } finally {
    database.close();
  }
}

function copyMigrations(): string {
  const directory = createTempDir('verify-migrations');
  cpSync(MIGRATIONS_DIR, directory, { recursive: true });
  return directory;
}

function insertLedgerRow(
  database: DatabaseSync,
  options: {
    id: string;
    migrationName: string;
    finishedAt: string | null;
    rolledBackAt?: string | null;
    startedAt?: string;
  },
): void {
  database
    .prepare(
      `INSERT INTO "_prisma_migrations"
         ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
       VALUES (?, ?, ?, ?, NULL, ?, ?, 1)`,
    )
    .run(
      options.id,
      'test-checksum',
      options.finishedAt,
      options.migrationName,
      options.rolledBackAt ?? null,
      options.startedAt ?? '2026-10-21T00:00:00.000Z',
    );
}

function removeDatabaseJournals(databaseFilePath: string): void {
  rmSync(`${databaseFilePath}-wal`, { force: true });
  rmSync(`${databaseFilePath}-shm`, { force: true });
}

afterAll(() => {
  for (const directory of tempDirs) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('migration verification', () => {
  it('passes for a migrated database with every local migration applied', () => {
    const database = createTempDatabase('verify-ok');

    try {
      const result = verifyMigrations({
        databaseFilePath: database.filePath,
      });

      expect(result.appliedMigrations).toEqual(result.localMigrations);
      expect(result.migrationCount).toBe(result.localMigrations.length);
      expect(result.migrationCount).toBeGreaterThanOrEqual(2);
    } finally {
      database.cleanup();
    }
  });

  it('reports DATABASE_MISSING without creating the database file', () => {
    const directory = createTempDir('verify-missing-db');
    const databaseFilePath = path.join(directory, 'missing.db');

    const error = captureVerificationError(() =>
      verifyMigrations({ databaseFilePath }),
    );

    expect(error.code).toBe('DATABASE_MISSING');
    expect(existsSync(databaseFilePath)).toBe(false);
  });

  it('reports MIGRATIONS_DIR_MISSING when the migrations directory is absent', () => {
    const database = createTempDatabase('verify-no-dir');
    const directory = createTempDir('verify-no-dir-root');
    const migrationsDir = path.join(directory, 'absent');

    try {
      const error = captureVerificationError(() =>
        verifyMigrations({
          databaseFilePath: database.filePath,
          migrationsDir,
        }),
      );

      expect(error.code).toBe('MIGRATIONS_DIR_MISSING');
    } finally {
      database.cleanup();
    }
  });

  it('reports MIGRATIONS_LEDGER_MISSING for an unmigrated database', () => {
    const database = createEmptyDatabase('verify-no-ledger');

    try {
      const error = captureVerificationError(() =>
        verifyMigrations({ databaseFilePath: database.filePath }),
      );

      expect(error.code).toBe('MIGRATIONS_LEDGER_MISSING');
    } finally {
      database.cleanup();
    }
  });

  it('reports MIGRATIONS_PENDING when a local migration is not applied', () => {
    const database = createTempDatabase('verify-pending');
    const migrationsDir = copyMigrations();
    const pendingName = '20990101000000_pending_probe';
    const pendingDir = path.join(migrationsDir, pendingName);

    mkdirSync(pendingDir);
    writeFileSync(path.join(pendingDir, 'migration.sql'), 'SELECT 1;\n', 'utf8');

    try {
      const error = captureVerificationError(() =>
        verifyMigrations({
          databaseFilePath: database.filePath,
          migrationsDir,
        }),
      );

      expect(error.code).toBe('MIGRATIONS_PENDING');
      expect(error.message).toContain(pendingName);
    } finally {
      database.cleanup();
    }
  });

  it('reports MIGRATIONS_UNKNOWN when the ledger references a missing migration', () => {
    const database = createTempDatabase('verify-unknown');
    const migrationsDir = createTempDir('verify-empty-migrations');

    try {
      const error = captureVerificationError(() =>
        verifyMigrations({
          databaseFilePath: database.filePath,
          migrationsDir,
        }),
      );

      expect(error.code).toBe('MIGRATIONS_UNKNOWN');
      expect(error.message).toContain(readMigrationNames()[0]);
    } finally {
      database.cleanup();
    }
  });

  it('reports MIGRATIONS_FAILED for an unfinished ledger row', () => {
    const database = createTempDatabase('verify-failed');

    try {
      withLedger(database.filePath, (ledger) => {
        insertLedgerRow(ledger, {
          id: `failed-${Date.now()}`,
          migrationName: '20990101000000_failed_probe',
          finishedAt: null,
        });
      });

      const error = captureVerificationError(() =>
        verifyMigrations({ databaseFilePath: database.filePath }),
      );

      expect(error.code).toBe('MIGRATIONS_FAILED');
      expect(error.message).toContain('20990101000000_failed_probe');
    } finally {
      database.cleanup();
    }
  });

  it('reports MIGRATIONS_DUPLICATE for repeated applied ledger rows', () => {
    const database = createTempDatabase('verify-duplicate');
    const migrationName = readMigrationNames()[0];

    try {
      withLedger(database.filePath, (ledger) => {
        insertLedgerRow(ledger, {
          id: `duplicate-${Date.now()}`,
          migrationName,
          finishedAt: '2026-10-21T01:00:00.000Z',
        });
      });

      const error = captureVerificationError(() =>
        verifyMigrations({ databaseFilePath: database.filePath }),
      );

      expect(error.code).toBe('MIGRATIONS_DUPLICATE');
      expect(error.message).toContain(migrationName);
    } finally {
      database.cleanup();
    }
  });

  it('reports MIGRATIONS_ORDER_MISMATCH when the applied order is reversed', () => {
    const database = createTempDatabase('verify-order');
    const migrationNames = readMigrationNames();

    try {
      withLedger(database.filePath, (ledger) => {
        ledger
          .prepare(
            'UPDATE "_prisma_migrations" SET "started_at" = ? WHERE "migration_name" = ?',
          )
          .run('2099-01-01T00:00:00.000Z', migrationNames[0]);
        ledger
          .prepare(
            'UPDATE "_prisma_migrations" SET "started_at" = ? WHERE "migration_name" = ?',
          )
          .run('2000-01-01T00:00:00.000Z', migrationNames[1]);
      });

      const error = captureVerificationError(() =>
        verifyMigrations({ databaseFilePath: database.filePath }),
      );

      expect(error.code).toBe('MIGRATIONS_ORDER_MISMATCH');
    } finally {
      database.cleanup();
    }
  });
});

describe('migration verification CLI', () => {
  it('prints a success summary for a migrated database', () => {
    const database = createTempDatabase('verify-cli-ok');

    try {
      const result = runDbVerifyCli({
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(0);
      expect(result.output).toContain('[db:verify] local_migrations=');
      expect(result.output).toContain('[db:verify] applied_migrations=');
      expect(result.output).toContain('[db:verify] OK');
      expect(result.output).not.toContain(PROJECT_ROOT);
    } finally {
      database.cleanup();
    }
  });

  it('fails with a stable error code and does not create a missing database', () => {
    const database: TempDatabase = createEmptyDatabase('verify-cli-missing');
    database.cleanup();

    const result = runDbVerifyCli({
      NODE_ENV: 'test',
      DATABASE_URL: database.url,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('DATABASE_MISSING');
    expect(result.output).not.toContain(PROJECT_ROOT);
    expect(existsSync(database.filePath)).toBe(false);
  });
});

describe('migration status CLI', () => {
  it('prints the Prisma migration status for a migrated database', () => {
    const database = createTempDatabase('status-cli-ok');

    try {
      const result = runDbStatusCli({
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
      });

      expect(result.status).toBe(0);
      expect(result.output).toContain('Database schema is up to date!');
      expect(result.output).toContain('[db:status] OK');
      expect(result.output).not.toContain(PROJECT_ROOT);
    } finally {
      database.cleanup();
    }
  });

  it('refuses a missing database without creating it', () => {
    const database: TempDatabase = createEmptyDatabase('status-cli-missing');
    database.cleanup();

    const result = runDbStatusCli({
      NODE_ENV: 'test',
      DATABASE_URL: database.url,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('DATABASE_MISSING');
    expect(existsSync(database.filePath)).toBe(false);
  });
});

describe('backup restore drill', () => {
  it('restores a verified backup and passes verification again', async () => {
    const database = createTempDatabase('verify-restore');
    const directory = createTempDir('verify-restore-work');
    const uploadDir = path.join(directory, 'uploads');
    const backupDir = path.join(directory, 'backups');

    mkdirSync(uploadDir);
    writeFileSync(path.join(uploadDir, 'drill.txt'), 'restore drill', 'utf8');

    try {
      const backup = await createBackup({
        databaseFilePath: database.filePath,
        uploadDir,
        backupDir,
        now: new Date('2026-10-21T12:00:00.000Z'),
      });

      withLedger(database.filePath, (ledger) => {
        ledger
          .prepare(
            'DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?',
          )
          .run(readMigrationNames()[0]);
      });

      const damaged = captureVerificationError(() =>
        verifyMigrations({ databaseFilePath: database.filePath }),
      );
      expect(damaged.code).toBe('MIGRATIONS_PENDING');

      removeDatabaseJournals(database.filePath);
      copyFileSync(
        path.join(backup.backupDir, 'genealogy.db'),
        database.filePath,
      );

      const restored = verifyMigrations({
        databaseFilePath: database.filePath,
      });

      expect(restored.appliedMigrations).toEqual(restored.localMigrations);
      expect(restored.migrationCount).toBeGreaterThanOrEqual(2);
    } finally {
      database.cleanup();
    }
  });
});
