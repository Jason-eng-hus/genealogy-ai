import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const SCHEMA_PATH = path.join(
  PROJECT_ROOT,
  'server',
  'prisma',
  'schema.prisma',
);
export const PRISMA_CLI_PATH = path.join(
  PROJECT_ROOT,
  'node_modules',
  'prisma',
  'build',
  'index.js',
);

export interface RunPrismaCliOptions {
  env?: NodeJS.ProcessEnv;
  inheritStdio?: boolean;
}

function assertPrismaCliAvailable(): void {
  if (!existsSync(PRISMA_CLI_PATH)) {
    throw new Error(
      'PRISMA_CLI_NOT_FOUND: install project dependencies before running database commands.',
    );
  }
}

export function runPrismaCli(
  args: string[],
  options: RunPrismaCliOptions = {},
): void {
  assertPrismaCliAvailable();

  execFileSync(process.execPath, [PRISMA_CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: options.inheritStdio === false ? 'pipe' : 'inherit',
  });
}

export function runMigrateDeploy(env: NodeJS.ProcessEnv): void {
  runPrismaCli(['migrate', 'deploy', '--schema', SCHEMA_PATH], { env });
}
