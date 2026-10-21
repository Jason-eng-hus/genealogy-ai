import {
  loadDatabaseConfig,
  projectRelativePath,
} from '../server/src/config/env.ts';
import {
  closeDatabase,
  initializeDatabase,
} from '../server/src/lib/prisma.ts';
import { formatCliError } from './support/cli-error.ts';

async function main(): Promise<void> {
  const config = loadDatabaseConfig();

  console.log(`[db:check] NODE_ENV=${config.appEnv}`);
  console.log(
    `[db:check] database=${projectRelativePath(config.databaseFilePath)}`,
  );

  const health = await initializeDatabase({ config });

  console.log(`[db:check] journal_mode=${health.journalMode}`);
  console.log(`[db:check] foreign_keys=${health.foreignKeys ? 'on' : 'off'}`);
  console.log(`[db:check] busy_timeout=${health.busyTimeoutMs}`);
  console.log(`[db:check] migrations=${health.migrationCount}`);
  console.log('[db:check] OK');
}

try {
  await main();
} catch (error) {
  console.error(`[db:check] FAILED ${formatCliError(error)}`);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => undefined);
}
