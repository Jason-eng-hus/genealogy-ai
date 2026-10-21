import { PrismaClient } from '@prisma/client';
import {
  loadDatabaseConfig,
  type DatabaseConfig,
} from '../config/env.ts';

export type DatabaseInitializationErrorCode =
  | 'DATABASE_NOT_INITIALIZED'
  | 'DATABASE_CONNECT_FAILED'
  | 'DATABASE_PRAGMA_FAILED'
  | 'MIGRATIONS_MISSING';

export class DatabaseInitializationError extends Error {
  readonly code: DatabaseInitializationErrorCode;

  constructor(
    code: DatabaseInitializationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DatabaseInitializationError';
    this.code = code;
  }
}

export interface DatabaseHealth {
  journalMode: 'wal';
  foreignKeys: true;
  busyTimeoutMs: number;
  migrationCount: number;
}

export interface InitializeDatabaseOptions {
  config?: DatabaseConfig;
}

type RawRow = Record<string, unknown>;

const MIGRATION_LEDGER_TABLE = '_prisma_migrations';

let prismaClient: PrismaClient | null = null;
let databaseHealth: DatabaseHealth | null = null;
let initializationPromise: Promise<DatabaseHealth> | null = null;

export function createPrismaClient(
  config: DatabaseConfig = loadDatabaseConfig(),
): PrismaClient {
  return new PrismaClient({ datasourceUrl: config.databaseUrl });
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }

  return Number.NaN;
}

function readRowValue(rows: RawRow[], key: string): unknown {
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  if (key in row) {
    return row[key];
  }

  const keys = Object.keys(row);

  return keys.length === 1 ? row[keys[0]] : undefined;
}

async function applyConnectionPragmas(
  prisma: PrismaClient,
  busyTimeoutMs: number,
): Promise<void> {
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
    throw new DatabaseInitializationError(
      'DATABASE_PRAGMA_FAILED',
      'busy_timeout must be a non-negative integer.',
    );
  }

  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
}

async function readDatabaseHealth(
  prisma: PrismaClient,
  busyTimeoutMs: number,
): Promise<DatabaseHealth> {
  const journalRows = await prisma.$queryRawUnsafe<RawRow[]>(
    'PRAGMA journal_mode',
  );
  const foreignKeyRows = await prisma.$queryRawUnsafe<RawRow[]>(
    'PRAGMA foreign_keys',
  );
  const busyTimeoutRows = await prisma.$queryRawUnsafe<RawRow[]>(
    'PRAGMA busy_timeout',
  );

  const journalMode = String(readRowValue(journalRows, 'journal_mode') ?? '')
    .trim()
    .toLowerCase();
  const foreignKeys = toNumber(readRowValue(foreignKeyRows, 'foreign_keys'));
  const actualBusyTimeoutMs = toNumber(
    readRowValue(busyTimeoutRows, 'timeout'),
  );

  if (journalMode !== 'wal') {
    throw new DatabaseInitializationError(
      'DATABASE_PRAGMA_FAILED',
      'WAL journal mode is not active on the SQLite connection.',
    );
  }

  if (foreignKeys !== 1) {
    throw new DatabaseInitializationError(
      'DATABASE_PRAGMA_FAILED',
      'Foreign key enforcement is not active on the SQLite connection.',
    );
  }

  if (actualBusyTimeoutMs !== busyTimeoutMs) {
    throw new DatabaseInitializationError(
      'DATABASE_PRAGMA_FAILED',
      'busy_timeout was not applied to the SQLite connection.',
    );
  }

  const ledgerRows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${MIGRATION_LEDGER_TABLE}'`,
  );

  if (ledgerRows.length === 0) {
    throw new DatabaseInitializationError(
      'MIGRATIONS_MISSING',
      'Database migrations are not applied; run "npm run db:migrate" first.',
    );
  }

  const migrationCountRows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT COUNT(*) AS count FROM "${MIGRATION_LEDGER_TABLE}" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const migrationCount = toNumber(
    readRowValue(migrationCountRows, 'count'),
  );

  if (!Number.isInteger(migrationCount) || migrationCount <= 0) {
    throw new DatabaseInitializationError(
      'MIGRATIONS_MISSING',
      'Database migrations are not applied; run "npm run db:migrate" first.',
    );
  }

  return {
    journalMode: 'wal',
    foreignKeys: true,
    busyTimeoutMs,
    migrationCount,
  };
}

async function performInitialization(
  options: InitializeDatabaseOptions,
): Promise<DatabaseHealth> {
  const config = options.config ?? loadDatabaseConfig();
  let client: PrismaClient;

  try {
    client = createPrismaClient(config);
  } catch (error) {
    throw new DatabaseInitializationError(
      'DATABASE_CONNECT_FAILED',
      'Unable to create the SQLite client; check DATABASE_URL.',
      { cause: error },
    );
  }

  try {
    await client.$connect();
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    throw new DatabaseInitializationError(
      'DATABASE_CONNECT_FAILED',
      'Unable to connect to the SQLite database; check DATABASE_URL and file permissions.',
      { cause: error },
    );
  }

  try {
    await applyConnectionPragmas(client, config.busyTimeoutMs);
    const health = await readDatabaseHealth(client, config.busyTimeoutMs);

    prismaClient = client;
    databaseHealth = health;

    return health;
  } catch (error) {
    await client.$disconnect().catch(() => undefined);

    if (error instanceof DatabaseInitializationError) {
      throw error;
    }

    throw new DatabaseInitializationError(
      'DATABASE_PRAGMA_FAILED',
      'Unable to apply or verify SQLite connection pragmas.',
      { cause: error },
    );
  }
}

export function initializeDatabase(
  options: InitializeDatabaseOptions = {},
): Promise<DatabaseHealth> {
  if (prismaClient !== null && databaseHealth !== null) {
    return Promise.resolve(databaseHealth);
  }

  if (initializationPromise !== null) {
    return initializationPromise;
  }

  initializationPromise = performInitialization(options).finally(() => {
    initializationPromise = null;
  });

  return initializationPromise;
}

export function getPrisma(): PrismaClient {
  if (prismaClient === null) {
    throw new DatabaseInitializationError(
      'DATABASE_NOT_INITIALIZED',
      'Database is not initialized; call initializeDatabase() during startup.',
    );
  }

  return prismaClient;
}

export function getDatabaseHealth(): DatabaseHealth {
  if (databaseHealth === null) {
    throw new DatabaseInitializationError(
      'DATABASE_NOT_INITIALIZED',
      'Database is not initialized; call initializeDatabase() during startup.',
    );
  }

  return databaseHealth;
}

export async function closeDatabase(): Promise<void> {
  if (initializationPromise !== null) {
    await initializationPromise.catch(() => undefined);
  }

  const client = prismaClient;
  prismaClient = null;
  databaseHealth = null;

  if (client === null) {
    return;
  }

  await client.$disconnect();
}
