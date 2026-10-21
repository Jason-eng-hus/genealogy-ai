import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDatabaseConfig,
  projectRelativePath,
} from '../server/src/config/env.ts';
import { formatCliError } from './support/cli-error.ts';
import { SCHEMA_PATH, runPrismaCli } from './support/prisma-cli.ts';

export type DatabaseStatusErrorCode = 'DATABASE_MISSING';

export class DatabaseStatusError extends Error {
  readonly code: DatabaseStatusErrorCode;

  constructor(
    code: DatabaseStatusErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DatabaseStatusError';
    this.code = code;
  }
}

export function assertDatabaseFile(databaseFilePath: string): void {
  let fileStat;

  try {
    fileStat = statSync(databaseFilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DatabaseStatusError(
        'DATABASE_MISSING',
        'Database file does not exist; run "npm run db:migrate" first.',
        { cause: error },
      );
    }

    throw new DatabaseStatusError(
      'DATABASE_MISSING',
      'Unable to inspect the database file.',
      { cause: error },
    );
  }

  if (!fileStat.isFile()) {
    throw new DatabaseStatusError(
      'DATABASE_MISSING',
      'Database path is not a regular file.',
    );
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

  assertDatabaseFile(config.databaseFilePath);

  console.log(`[db:status] NODE_ENV=${config.appEnv}`);
  console.log(
    `[db:status] database=${projectRelativePath(config.databaseFilePath)}`,
  );

  runPrismaCli(['migrate', 'status', '--schema', SCHEMA_PATH], {
    env: {
      DATABASE_URL: config.databaseUrl,
      NODE_ENV: config.appEnv,
    },
  });

  console.log('[db:status] OK');
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    console.error(`[db:status] FAILED ${formatCliError(error)}`);
    process.exitCode = 1;
  }
}
