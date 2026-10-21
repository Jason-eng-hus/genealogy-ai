import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const SCHEMA_PATH = path.join(
  PROJECT_ROOT,
  'server',
  'prisma',
  'schema.prisma',
);
const PRISMA_CLI_PATH = path.join(
  PROJECT_ROOT,
  'node_modules',
  'prisma',
  'build',
  'index.js',
);

export const TEST_TMP_DIR = path.join(PROJECT_ROOT, 'server', 'prisma', '.tmp');

const DATABASE_SUFFIXES = ['', '-wal', '-shm', '-journal'] as const;

let sequence = 0;

export interface TempDatabase {
  name: string;
  url: string;
  filePath: string;
  migrate: () => void;
  cleanup: () => void;
}

function removeDatabaseFiles(filePath: string): void {
  for (const suffix of DATABASE_SUFFIXES) {
    rmSync(`${filePath}${suffix}`, { force: true });
  }
}

function buildTempDatabase(
  label: string,
  createFile: boolean,
  directory: string,
): TempDatabase {
  const absoluteDirectory = path.join(TEST_TMP_DIR, directory);
  mkdirSync(absoluteDirectory, { recursive: true });

  sequence += 1;
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const name = `${safeLabel}-${process.pid}-${Date.now()}-${sequence}.db`;
  const filePath = path.join(absoluteDirectory, name);
  const relativeDirectory = ['.tmp', directory]
    .filter((part) => part !== '')
    .join('/')
    .replace(/\\/g, '/');
  const url = `file:./${relativeDirectory}/${name}`;

  if (createFile) {
    const database = new DatabaseSync(filePath);
    database.close();
  }

  const migrate = (): void => {
    execFileSync(
      process.execPath,
      [PRISMA_CLI_PATH, 'migrate', 'deploy', '--schema', SCHEMA_PATH],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: url,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  };

  return {
    name,
    url,
    filePath,
    migrate,
    cleanup: () => removeDatabaseFiles(filePath),
  };
}

export function createTempDatabase(
  label = 'test',
  directory = '',
): TempDatabase {
  const database = buildTempDatabase(label, false, directory);

  try {
    database.migrate();
  } catch (error) {
    database.cleanup();
    throw error;
  }

  return database;
}

export function createEmptyDatabase(
  label = 'empty',
  directory = '',
): TempDatabase {
  return buildTempDatabase(label, true, directory);
}
