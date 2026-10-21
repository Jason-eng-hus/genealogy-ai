import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  isPathInsideProject,
  loadDatabaseConfig,
  PROJECT_ROOT,
  projectRelativePath,
} from '../server/src/config/env.ts';
import {
  closeDatabase,
  initializeDatabase,
} from '../server/src/lib/prisma.ts';
import { formatCliError } from './support/cli-error.ts';
import { runMigrateDeploy } from './support/prisma-cli.ts';

const RESETTABLE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);
const DATABASE_SUFFIXES = ['', '-wal', '-shm', '-journal'] as const;

export type ResetErrorCode =
  | 'RESET_PRODUCTION_FORBIDDEN'
  | 'RESET_TARGET_OUTSIDE_PROJECT'
  | 'RESET_TARGET_NOT_DATABASE_FILE'
  | 'RESET_CONFIRMATION_REQUIRED';

export class ResetError extends Error {
  readonly code: ResetErrorCode;

  constructor(code: ResetErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResetError';
    this.code = code;
  }
}

export function assertResetTarget(
  filePath: string,
  projectRoot: string = PROJECT_ROOT,
): void {
  const resolved = path.resolve(filePath);

  if (!isPathInsideProject(resolved, projectRoot)) {
    throw new ResetError(
      'RESET_TARGET_OUTSIDE_PROJECT',
      'Refusing to reset a database outside the project directory.',
    );
  }

  if (!RESETTABLE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new ResetError(
      'RESET_TARGET_NOT_DATABASE_FILE',
      'Refusing to reset a file that is not a .db, .sqlite, or .sqlite3 database.',
    );
  }
}

async function requireConfirmation(argv: string[]): Promise<void> {
  if (argv.includes('--confirm=RESET')) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new ResetError(
      'RESET_CONFIRMATION_REQUIRED',
      'Reset requires --confirm=RESET in non-interactive mode.',
    );
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await readline.question(
      'Type RESET to confirm database reset: ',
    );

    if (answer.trim() !== 'RESET') {
      throw new ResetError(
        'RESET_CONFIRMATION_REQUIRED',
        'Confirmation did not match RESET.',
      );
    }
  } finally {
    readline.close();
  }
}

async function main(): Promise<void> {
  const config = loadDatabaseConfig();

  if (config.appEnv === 'production') {
    throw new ResetError(
      'RESET_PRODUCTION_FORBIDDEN',
      'Refusing to reset a database when NODE_ENV=production.',
    );
  }

  assertResetTarget(config.databaseFilePath);
  await requireConfirmation(process.argv.slice(2));

  console.log(`[db:reset] NODE_ENV=${config.appEnv}`);
  console.log(
    `[db:reset] database=${projectRelativePath(config.databaseFilePath)}`,
  );
  console.log('[db:reset] removing database file and journal files...');

  for (const suffix of DATABASE_SUFFIXES) {
    rmSync(`${config.databaseFilePath}${suffix}`, { force: true });
  }

  mkdirSync(path.dirname(config.databaseFilePath), { recursive: true });

  console.log('[db:reset] recreating schema...');

  try {
    runMigrateDeploy({
      DATABASE_URL: config.databaseUrl,
      NODE_ENV: config.appEnv,
    });
  } catch (error) {
    throw new Error('MIGRATION_DEPLOY_FAILED', { cause: error });
  }

  const health = await initializeDatabase({ config });

  console.log(`[db:reset] journal_mode=${health.journalMode}`);
  console.log(`[db:reset] foreign_keys=${health.foreignKeys ? 'on' : 'off'}`);
  console.log(`[db:reset] busy_timeout=${health.busyTimeoutMs}`);
  console.log(`[db:reset] migrations=${health.migrationCount}`);
  console.log('[db:reset] reset complete');
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];

  if (!entry) {
    return false;
  }

  const entryPath = path.resolve(entry);
  const modulePath = fileURLToPath(import.meta.url);

  if (process.platform === 'win32') {
    return entryPath.toLowerCase() === modulePath.toLowerCase();
  }

  return entryPath === modulePath;
}

async function runCli(): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(`[db:reset] FAILED ${formatCliError(error)}`);
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => undefined);
  }
}

if (isDirectExecution()) {
  await runCli();
}
