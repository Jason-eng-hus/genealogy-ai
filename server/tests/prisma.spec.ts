import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DatabaseInitializationError,
  closeDatabase,
  getDatabaseHealth,
  getPrisma,
  initializeDatabase,
  type DatabaseInitializationErrorCode,
} from '../src/lib/prisma.ts';
import {
  resolveDatabaseConfig,
  type DatabaseConfig,
} from '../src/config/env.ts';
import {
  createEmptyDatabase,
  createTempDatabase,
  type TempDatabase,
} from './support/temp-database.ts';

const FAMILY_INSERT_SQL =
  'INSERT INTO "Family" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)';

async function captureDatabaseError(
  action: () => Promise<unknown> | unknown,
  code: DatabaseInitializationErrorCode,
): Promise<DatabaseInitializationError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseInitializationError);
    const databaseError = error as DatabaseInitializationError;
    expect(databaseError.code).toBe(code);
    return databaseError;
  }

  throw new Error(`Expected DatabaseInitializationError with code ${code}`);
}

describe('database initialization', () => {
  let temp: TempDatabase;
  let config: DatabaseConfig;

  beforeAll(() => {
    temp = createTempDatabase('prisma');
    config = resolveDatabaseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: temp.url,
    });
  });

  afterAll(async () => {
    await closeDatabase();
    temp.cleanup();
  });

  it('refuses client access before initialization', async () => {
    await captureDatabaseError(() => getPrisma(), 'DATABASE_NOT_INITIALIZED');
    await captureDatabaseError(
      () => getDatabaseHealth(),
      'DATABASE_NOT_INITIALIZED',
    );
  });

  it('applies and verifies WAL, foreign keys, and busy_timeout', async () => {
    const health = await initializeDatabase({ config });

    expect(health.journalMode).toBe('wal');
    expect(health.foreignKeys).toBe(true);
    expect(health.busyTimeoutMs).toBe(5000);
    expect(health.migrationCount).toBeGreaterThanOrEqual(1);

    expect(getDatabaseHealth()).toEqual(health);
    expect(getPrisma()).toBeDefined();
  });

  it('is idempotent for repeated initialization', async () => {
    const client = getPrisma();
    const firstHealth = getDatabaseHealth();
    const secondHealth = await initializeDatabase({ config });

    expect(secondHealth).toEqual(firstHealth);
    expect(getPrisma()).toBe(client);
  });

  it('persists WAL mode for independent SQLite connections', () => {
    const raw = new DatabaseSync(temp.filePath);

    try {
      const row = raw.prepare('PRAGMA journal_mode').get() as {
        journal_mode: string;
      };

      expect(row.journal_mode.toLowerCase()).toBe('wal');
    } finally {
      raw.close();
    }
  });

  it('enforces foreign keys for raw writes through Prisma', async () => {
    const prisma = getPrisma();
    const now = new Date().toISOString();

    await expect(
      prisma.$executeRawUnsafe(
        'INSERT INTO "Person" ("id", "familyId", "surname", "givenName", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
        'person-missing-family',
        'missing-family',
        '张',
        '某',
        now,
        now,
      ),
    ).rejects.toThrow(/foreign key/i);

    const family = await prisma.family.create({
      data: { name: '测试家族' },
    });

    expect(family.id.length).toBeGreaterThan(0);
  });

  it('allows reads while another connection holds a write transaction', async () => {
    const prisma = getPrisma();
    const raw = new DatabaseSync(temp.filePath);
    const now = new Date().toISOString();
    let readError: unknown = null;
    let committed = false;

    raw.exec('PRAGMA busy_timeout = 5000');

    try {
      raw.exec('BEGIN IMMEDIATE');
      raw
        .prepare(FAMILY_INSERT_SQL)
        .run('family-concurrent-read', 'Concurrent Read', now, now);

      const readPromise = prisma.family.findMany({
        where: { id: 'family-concurrent-read' },
      });
      const commitTimer = setTimeout(() => {
        try {
          raw.exec('COMMIT');
          committed = true;
        } catch {
          committed = false;
        }
      }, 100);

      try {
        await readPromise;
      } catch (error) {
        readError = error;
      } finally {
        clearTimeout(commitTimer);

        if (!committed) {
          try {
            raw.exec('COMMIT');
            committed = true;
          } catch {
            try {
              raw.exec('ROLLBACK');
            } catch {
              // The transaction may already have been rolled back.
            }
          }
        }
      }

      expect(readError).toBeNull();

      const persisted = await prisma.family.findUnique({
        where: { id: 'family-concurrent-read' },
      });
      expect(persisted?.name).toBe('Concurrent Read');
    } finally {
      try {
        raw.exec('ROLLBACK');
      } catch {
        // The transaction is normally committed before this point.
      }
      raw.close();
    }
  });

  it('waits for a busy database instead of failing immediately', async () => {
    const prisma = getPrisma();
    const raw = new DatabaseSync(temp.filePath);
    const now = new Date().toISOString();

    raw.exec('PRAGMA busy_timeout = 5000');

    try {
      raw.exec('BEGIN IMMEDIATE');
      raw
        .prepare(FAMILY_INSERT_SQL)
        .run('family-writer-lock', 'Writer Lock', now, now);

      const startedAt = Date.now();
      const writePromise = prisma.family.create({
        data: { name: 'Waited Writer' },
      });
      const commitTimer = setTimeout(() => {
        try {
          raw.exec('COMMIT');
        } catch {
          // The transaction may already have been committed.
        }
      }, 150);

      try {
        const created = await writePromise;

        expect(created.name).toBe('Waited Writer');
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(50);
      } finally {
        clearTimeout(commitTimer);
        try {
          raw.exec('COMMIT');
        } catch {
          // The transaction may already have been committed.
        }
      }
    } finally {
      raw.close();
    }
  });

  it('closes idempotently and clears the singletons', async () => {
    await closeDatabase();
    await expect(closeDatabase()).resolves.toBeUndefined();
    await captureDatabaseError(() => getPrisma(), 'DATABASE_NOT_INITIALIZED');
    await captureDatabaseError(
      () => getDatabaseHealth(),
      'DATABASE_NOT_INITIALIZED',
    );
  });
});

describe('database startup checks', () => {
  it('rejects an empty database without applied migrations', async () => {
    await closeDatabase();
    const empty = createEmptyDatabase('unmigrated');

    try {
      const config = resolveDatabaseConfig({
        NODE_ENV: 'test',
        DATABASE_URL: empty.url,
      });

      await captureDatabaseError(
        () => initializeDatabase({ config }),
        'MIGRATIONS_MISSING',
      );
      await captureDatabaseError(
        () => getPrisma(),
        'DATABASE_NOT_INITIALIZED',
      );
    } finally {
      await closeDatabase();
      empty.cleanup();
    }
  });

  it('initializes a database path that contains spaces', async () => {
    await closeDatabase();
    const spaced = createTempDatabase('space-case', 'with space');

    try {
      const config = resolveDatabaseConfig({
        NODE_ENV: 'test',
        DATABASE_URL: spaced.url,
      });
      const health = await initializeDatabase({ config });

      expect(health.journalMode).toBe('wal');
      expect(health.migrationCount).toBeGreaterThanOrEqual(1);
    } finally {
      await closeDatabase();
      spaced.cleanup();
    }
  });
});
