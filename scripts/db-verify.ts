import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_ROOT,
  loadDatabaseConfig,
  projectRelativePath,
} from '../server/src/config/env.ts';
import { formatCliError } from './support/cli-error.ts';

export type MigrationVerificationErrorCode =
  | 'DATABASE_MISSING'
  | 'MIGRATIONS_DIR_MISSING'
  | 'MIGRATIONS_LEDGER_MISSING'
  | 'MIGRATIONS_PENDING'
  | 'MIGRATIONS_UNKNOWN'
  | 'MIGRATIONS_FAILED'
  | 'MIGRATIONS_DUPLICATE'
  | 'MIGRATIONS_ORDER_MISMATCH';

export class MigrationVerificationError extends Error {
  readonly code: MigrationVerificationErrorCode;

  constructor(
    code: MigrationVerificationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MigrationVerificationError';
    this.code = code;
  }
}

export interface VerifyMigrationsOptions {
  databaseFilePath?: string;
  migrationsDir?: string;
}

export interface MigrationVerificationResult {
  databaseFilePath: string;
  migrationsDir: string;
  localMigrations: string[];
  appliedMigrations: string[];
  migrationCount: number;
}

interface MigrationLedgerRow {
  migration_name: string;
  finished_at: string | null;
  rolled_back_at: string | null;
}

export const MIGRATIONS_DIR = path.join(
  PROJECT_ROOT,
  'server',
  'prisma',
  'migrations',
);
export const MIGRATION_LEDGER_TABLE = '_prisma_migrations';

function compareMigrationNames(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
}

function assertDatabaseFile(databaseFilePath: string): void {
  let fileStat;

  try {
    fileStat = statSync(databaseFilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MigrationVerificationError(
        'DATABASE_MISSING',
        'Database file does not exist; run "npm run db:migrate" first.',
        { cause: error },
      );
    }

    throw new MigrationVerificationError(
      'DATABASE_MISSING',
      'Unable to inspect the database file.',
      { cause: error },
    );
  }

  if (!fileStat.isFile()) {
    throw new MigrationVerificationError(
      'DATABASE_MISSING',
      'Database path is not a regular file.',
    );
  }
}

function readLocalMigrations(migrationsDir: string): string[] {
  let directoryStat;

  try {
    directoryStat = statSync(migrationsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MigrationVerificationError(
        'MIGRATIONS_DIR_MISSING',
        'Migrations directory is missing.',
        { cause: error },
      );
    }

    throw new MigrationVerificationError(
      'MIGRATIONS_DIR_MISSING',
      'Unable to inspect the migrations directory.',
      { cause: error },
    );
  }

  if (!directoryStat.isDirectory()) {
    throw new MigrationVerificationError(
      'MIGRATIONS_DIR_MISSING',
      'Migrations path is not a directory.',
    );
  }

  try {
    return readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareMigrationNames);
  } catch (error) {
    throw new MigrationVerificationError(
      'MIGRATIONS_DIR_MISSING',
      'Unable to read the migrations directory.',
      { cause: error },
    );
  }
}

function readLedgerRows(database: DatabaseSync): MigrationLedgerRow[] {
  const ledger = database
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get(MIGRATION_LEDGER_TABLE);

  if (ledger === undefined) {
    throw new MigrationVerificationError(
      'MIGRATIONS_LEDGER_MISSING',
      'Migration ledger "_prisma_migrations" is missing; run "npm run db:migrate" first.',
    );
  }

  try {
    const rows = database
      .prepare(
        `SELECT migration_name, finished_at, rolled_back_at
         FROM "_prisma_migrations"
         ORDER BY started_at ASC, id ASC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      migration_name: String(row.migration_name),
      finished_at:
        row.finished_at === null || row.finished_at === undefined
          ? null
          : String(row.finished_at),
      rolled_back_at:
        row.rolled_back_at === null || row.rolled_back_at === undefined
          ? null
          : String(row.rolled_back_at),
    }));
  } catch (error) {
    throw new MigrationVerificationError(
      'MIGRATIONS_LEDGER_MISSING',
      'Unable to read the migration ledger.',
      { cause: error },
    );
  }
}

function formatNameList(names: string[]): string {
  return names.join(', ');
}

function findDuplicateNames(rows: MigrationLedgerRow[]): string[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.migration_name, (counts.get(row.migration_name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort(compareMigrationNames);
}

export function verifyMigrations(
  options: VerifyMigrationsOptions = {},
): MigrationVerificationResult {
  const databaseFilePath = path.resolve(
    options.databaseFilePath ?? loadDatabaseConfig().databaseFilePath,
  );
  const migrationsDir = path.resolve(options.migrationsDir ?? MIGRATIONS_DIR);

  const localMigrations = readLocalMigrations(migrationsDir);
  assertDatabaseFile(databaseFilePath);

  let database: DatabaseSync | null = null;

  try {
    database = new DatabaseSync(databaseFilePath, { readOnly: true });
    const rows = readLedgerRows(database);
    const activeRows = rows.filter((row) => row.rolled_back_at === null);

    const failed = activeRows
      .filter((row) => row.finished_at === null)
      .map((row) => row.migration_name);

    if (failed.length > 0) {
      throw new MigrationVerificationError(
        'MIGRATIONS_FAILED',
        `Failed migrations: ${formatNameList(failed)}. Restore the pre-migration backup or resolve the migration before deploying.`,
      );
    }

    const duplicateNames = findDuplicateNames(activeRows);

    if (duplicateNames.length > 0) {
      throw new MigrationVerificationError(
        'MIGRATIONS_DUPLICATE',
        `Duplicate applied migrations in the ledger: ${formatNameList(duplicateNames)}.`,
      );
    }

    const appliedMigrations = activeRows
      .filter((row) => row.finished_at !== null)
      .map((row) => row.migration_name);
    const localNames = new Set(localMigrations);
    const unknown = appliedMigrations.filter((name) => !localNames.has(name));

    if (unknown.length > 0) {
      throw new MigrationVerificationError(
        'MIGRATIONS_UNKNOWN',
        `Applied migrations missing from the local migrations directory: ${formatNameList(unknown)}.`,
      );
    }

    const appliedNames = new Set(appliedMigrations);
    const pending = localMigrations.filter((name) => !appliedNames.has(name));

    if (pending.length > 0) {
      throw new MigrationVerificationError(
        'MIGRATIONS_PENDING',
        `Pending migrations: ${formatNameList(pending)}. Run "npm run db:migrate".`,
      );
    }

    const orderedPrefix = localMigrations.slice(0, appliedMigrations.length);

    if (
      appliedMigrations.length !== localMigrations.length ||
      appliedMigrations.some((name, index) => name !== orderedPrefix[index])
    ) {
      throw new MigrationVerificationError(
        'MIGRATIONS_ORDER_MISMATCH',
        'Applied migration order does not match the local migration order.',
      );
    }

    return {
      databaseFilePath,
      migrationsDir,
      localMigrations,
      appliedMigrations,
      migrationCount: appliedMigrations.length,
    };
  } catch (error) {
    if (error instanceof MigrationVerificationError) {
      throw error;
    }

    throw new MigrationVerificationError(
      'DATABASE_MISSING',
      'Unable to open the database file read-only.',
      { cause: error },
    );
  } finally {
    database?.close();
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];

  if (!entry) {
    return false;
  }

  const entryPath = path.resolve(entry);
  const modulePath = path.resolve(fileURLToPath(import.meta.url));

  return process.platform === 'win32'
    ? entryPath.toLowerCase() === modulePath.toLowerCase()
    : entryPath === modulePath;
}

function main(): void {
  const config = loadDatabaseConfig();
  const result = verifyMigrations({
    databaseFilePath: config.databaseFilePath,
  });

  console.log(`[db:verify] NODE_ENV=${config.appEnv}`);
  console.log(
    `[db:verify] database=${projectRelativePath(result.databaseFilePath)}`,
  );
  console.log(`[db:verify] local_migrations=${result.localMigrations.length}`);
  console.log(`[db:verify] applied_migrations=${result.migrationCount}`);
  console.log('[db:verify] OK');
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    console.error(`[db:verify] FAILED ${formatCliError(error)}`);
    process.exitCode = 1;
  }
}
