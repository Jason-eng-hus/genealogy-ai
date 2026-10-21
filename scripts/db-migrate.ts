import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  loadDatabaseConfig,
  projectRelativePath,
} from '../server/src/config/env.ts';
import {
  closeDatabase,
  initializeDatabase,
} from '../server/src/lib/prisma.ts';
import { formatCliError } from './support/cli-error.ts';
import { runMigrateDeploy } from './support/prisma-cli.ts';

async function main(): Promise<void> {
  const config = loadDatabaseConfig();

  mkdirSync(path.dirname(config.databaseFilePath), { recursive: true });

  console.log(`[db:migrate] NODE_ENV=${config.appEnv}`);
  console.log(
    `[db:migrate] database=${projectRelativePath(config.databaseFilePath)}`,
  );
  console.log('[db:migrate] applying migrations...');

  try {
    runMigrateDeploy({
      DATABASE_URL: config.databaseUrl,
      NODE_ENV: config.appEnv,
    });
  } catch (error) {
    throw new Error('MIGRATION_DEPLOY_FAILED', { cause: error });
  }

  const health = await initializeDatabase({ config });

  console.log(`[db:migrate] journal_mode=${health.journalMode}`);
  console.log(`[db:migrate] foreign_keys=${health.foreignKeys ? 'on' : 'off'}`);
  console.log(`[db:migrate] busy_timeout=${health.busyTimeoutMs}`);
  console.log(`[db:migrate] migrations=${health.migrationCount}`);
  console.log('[db:migrate] OK');
}

try {
  await main();
} catch (error) {
  console.error(`[db:migrate] FAILED ${formatCliError(error)}`);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => undefined);
}
