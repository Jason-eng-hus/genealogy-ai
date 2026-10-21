import { spawnSync } from 'node:child_process';
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBackup, type BackupManifest } from '../../scripts/backup.ts';
import { computeSha256 } from '../src/services/files.ts';
import {
  createTempDatabase,
  TEST_TMP_DIR,
  type TempDatabase,
} from './support/temp-database.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(
  TEST_TMP_DIR,
  `backup-${process.pid}-${Date.now()}`,
);
const relativeTmp = path.relative(TEST_TMP_DIR, tmpRoot).split(path.sep).join('/');
const uploadDir = path.join(tmpRoot, 'uploads');
const backupDir = path.join(tmpRoot, 'backups');

const EXPECTED_TABLE_COUNTS: Record<string, number> = {
  AiDraft: 0,
  AiJob: 0,
  AuditLog: 1,
  Citation: 0,
  ConsistencyIssue: 0,
  Event: 0,
  Family: 1,
  GedcomImport: 0,
  GedcomXref: 0,
  Narrative: 0,
  Person: 1,
  Relation: 0,
  ReviewRequest: 0,
  Source: 1,
  User: 1,
};

const uploadFixtures = [
  { relativePath: 'readme.txt', content: Buffer.from('hello backup') },
  {
    relativePath: 'nested/scan.png',
    content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
];

let primary: TempDatabase;
let database: DatabaseSync | null = null;

function insertFixtures(db: DatabaseSync): void {
  const now = '2026-10-21T00:00:00.000Z';

  db.prepare(
    'INSERT INTO "Family" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)',
  ).run('family-backup', '备份家族', now, now);
  db.prepare(
    'INSERT INTO "Person" ("id", "familyId", "surname", "givenName", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
  ).run('person-backup', 'family-backup', '张', '备份', now, now);
  db.prepare(
    'INSERT INTO "User" ("id", "username", "passwordHash", "displayName", "updatedAt") VALUES (?, ?, ?, ?, ?)',
  ).run('user-backup', 'backup-user', 'hash', '备份用户', now);
  db.prepare(
    'INSERT INTO "Source" ("id", "type", "title", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)',
  ).run('source-backup', 'TEXT', '旧谱文本', now, now);
  db.prepare(
    'INSERT INTO "AuditLog" ("id", "actorId", "actorRole", "action", "entityType", "entityId", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    'audit-backup',
    'user-backup',
    'ADMIN',
    'PERSON_CREATE',
    'PERSON',
    'person-backup',
    now,
  );
}

function countRows(db: DatabaseSync, table: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
    .get() as { count: number | bigint };
  return Number(row.count);
}

function writeUploadFixtures(): void {
  for (const fixture of uploadFixtures) {
    const filePath = path.join(uploadDir, fixture.relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, fixture.content);
  }
}

beforeAll(() => {
  primary = createTempDatabase('backup-primary', `${relativeTmp}/primary`);
  database = new DatabaseSync(primary.filePath);
  database.exec('PRAGMA foreign_keys = ON');
  insertFixtures(database);
  database.close();
  database = null;

  writeUploadFixtures();
});

afterAll(() => {
  database?.close();
  primary?.cleanup();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('createBackup', () => {
  it('backs up the database, uploads, and manifest with verification', async () => {
    const result = await createBackup({
      databaseFilePath: primary.filePath,
      uploadDir,
      backupDir,
      now: new Date('2026-10-21T12:34:56.789Z'),
    });

    expect(path.basename(result.backupDir)).toBe('2026-10-21T12-34-56-789Z');
    expect(existsSync(path.join(result.backupDir, 'genealogy.db'))).toBe(true);
    expect(existsSync(path.join(result.backupDir, 'uploads'))).toBe(true);
    expect(existsSync(path.join(result.backupDir, 'manifest.json'))).toBe(true);

    const manifest = JSON.parse(
      readFileSync(path.join(result.backupDir, 'manifest.json'), 'utf8'),
    ) as BackupManifest;
    expect(manifest).toEqual(result.manifest);
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.createdAt).toBe('2026-10-21T12:34:56.789Z');
    expect(manifest.database.file).toBe('genealogy.db');
    expect(manifest.uploads.directory).toBe('uploads');
    expect(manifest.tables).toEqual(EXPECTED_TABLE_COUNTS);

    const databaseBytes = readFileSync(
      path.join(result.backupDir, 'genealogy.db'),
    );
    expect(manifest.database.sizeBytes).toBe(databaseBytes.byteLength);
    expect(manifest.database.sha256).toBe(computeSha256(databaseBytes));

    const expectedUploadBytes = uploadFixtures.reduce(
      (total, fixture) => total + fixture.content.byteLength,
      0,
    );
    expect(manifest.uploads.fileCount).toBe(uploadFixtures.length);
    expect(manifest.uploads.totalBytes).toBe(expectedUploadBytes);

    for (const fixture of uploadFixtures) {
      expect(
        readFileSync(path.join(result.backupDir, 'uploads', fixture.relativePath)),
      ).toEqual(fixture.content);
    }

    const backupDatabase = new DatabaseSync(
      path.join(result.backupDir, 'genealogy.db'),
    );
    const integrity = backupDatabase.prepare('PRAGMA integrity_check').get() as
      | Record<string, unknown>
      | undefined;
    expect(String(Object.values(integrity ?? {})[0])).toBe('ok');
    expect(countRows(backupDatabase, 'Person')).toBe(1);
    expect(countRows(backupDatabase, 'AuditLog')).toBe(1);
    backupDatabase.close();
  });

  it('supports a restore with identical table counts and upload hashes', async () => {
    const result = await createBackup({
      databaseFilePath: primary.filePath,
      uploadDir,
      backupDir,
      now: new Date('2026-10-21T12:40:00.000Z'),
    });
    const restoreDir = path.join(tmpRoot, 'restore-check');

    rmSync(restoreDir, { recursive: true, force: true });
    mkdirSync(restoreDir, { recursive: true });
    copyFileSync(
      path.join(result.backupDir, 'genealogy.db'),
      path.join(restoreDir, 'genealogy.db'),
    );
    cpSync(path.join(result.backupDir, 'uploads'), path.join(restoreDir, 'uploads'), {
      recursive: true,
    });

    const restoredDatabase = new DatabaseSync(
      path.join(restoreDir, 'genealogy.db'),
    );

    for (const [table, expected] of Object.entries(EXPECTED_TABLE_COUNTS)) {
      expect(countRows(restoredDatabase, table), table).toBe(expected);
    }

    restoredDatabase.close();

    for (const fixture of uploadFixtures) {
      expect(
        computeSha256(
          readFileSync(path.join(restoreDir, 'uploads', fixture.relativePath)),
        ),
      ).toBe(computeSha256(fixture.content));
    }
  });

  it('does not overwrite an existing backup set with the same timestamp', async () => {
    const now = new Date('2026-10-21T13:00:00.000Z');
    const first = await createBackup({
      databaseFilePath: primary.filePath,
      uploadDir,
      backupDir,
      now,
    });
    const second = await createBackup({
      databaseFilePath: primary.filePath,
      uploadDir,
      backupDir,
      now,
    });

    expect(path.basename(first.backupDir)).toBe('2026-10-21T13-00-00-000Z');
    expect(path.basename(second.backupDir)).toBe('2026-10-21T13-00-00-000Z-2');
    expect(first.backupDir).not.toBe(second.backupDir);
  });

  it('creates an empty uploads directory when the source has no uploads', async () => {
    const result = await createBackup({
      databaseFilePath: primary.filePath,
      uploadDir: path.join(tmpRoot, 'empty-uploads'),
      backupDir: path.join(tmpRoot, 'empty-backups'),
      now: new Date('2026-10-21T14:00:00.000Z'),
    });

    expect(result.manifest.uploads.fileCount).toBe(0);
    expect(result.manifest.uploads.totalBytes).toBe(0);
    expect(existsSync(path.join(result.backupDir, 'uploads'))).toBe(true);
    expect(readdirSync(path.join(result.backupDir, 'uploads'))).toEqual([]);
  });

  it('reports a missing database without creating a backup set', async () => {
    const missingBackupDir = path.join(tmpRoot, 'missing-backups');

    await expect(
      createBackup({
        databaseFilePath: path.join(tmpRoot, 'missing.db'),
        uploadDir,
        backupDir: missingBackupDir,
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_DATABASE_MISSING' });
    expect(existsSync(missingBackupDir)).toBe(false);
  });

  it('rejects invalid directory layouts', async () => {
    const outside = path.resolve(projectRoot, '..', `backup-outside-${process.pid}`);

    await expect(
      createBackup({
        databaseFilePath: primary.filePath,
        uploadDir,
        backupDir: outside,
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_DIR_INVALID' });

    await expect(
      createBackup({
        databaseFilePath: path.join(uploadDir, 'inside.db'),
        uploadDir,
        backupDir: path.join(tmpRoot, 'inside-backups'),
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_DIR_INVALID' });

    await expect(
      createBackup({
        databaseFilePath: primary.filePath,
        uploadDir,
        backupDir: path.join(uploadDir, 'nested-backups'),
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_DIR_INVALID' });

    const notADirectory = path.join(tmpRoot, 'not-a-directory');
    writeFileSync(notADirectory, 'x', 'utf8');
    await expect(
      createBackup({
        databaseFilePath: primary.filePath,
        uploadDir,
        backupDir: notADirectory,
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_DIR_INVALID' });
  });

  it('removes the new backup set when the database schema is incomplete', async () => {
    const invalidDatabasePath = path.join(tmpRoot, 'invalid.db');
    const invalidDatabase = new DatabaseSync(invalidDatabasePath);
    invalidDatabase.exec('CREATE TABLE "Unrelated" ("id" TEXT PRIMARY KEY)');
    invalidDatabase.close();

    const cleanupBackupDir = path.join(tmpRoot, 'cleanup-backups');
    await expect(
      createBackup({
        databaseFilePath: invalidDatabasePath,
        uploadDir,
        backupDir: cleanupBackupDir,
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_FAILED' });

    expect(existsSync(cleanupBackupDir)).toBe(true);
    expect(readdirSync(cleanupBackupDir)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')(
    'refuses symbolic links in uploads and cleans up the backup set',
    async () => {
      const symlinkUploads = path.join(tmpRoot, 'symlink-uploads');
      const symlinkBackups = path.join(tmpRoot, 'symlink-backups');
      const target = path.join(tmpRoot, 'symlink-target.txt');
      mkdirSync(symlinkUploads, { recursive: true });
      writeFileSync(target, 'target', 'utf8');
      symlinkSync(target, path.join(symlinkUploads, 'link.txt'));

      await expect(
        createBackup({
          databaseFilePath: primary.filePath,
          uploadDir: symlinkUploads,
          backupDir: symlinkBackups,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_FAILED' });
      expect(readdirSync(symlinkBackups)).toEqual([]);
    },
  );

  it('handles database and storage paths containing spaces', async () => {
    const spaceRoot = path.join(tmpRoot, 'space dir');
    const spaceDatabasePath = path.join(spaceRoot, 'db', 'genealogy.db');
    const spaceUploads = path.join(spaceRoot, 'uploads');
    mkdirSync(path.dirname(spaceDatabasePath), { recursive: true });
    mkdirSync(spaceUploads, { recursive: true });
    writeFileSync(path.join(spaceUploads, 'a.txt'), 'a', 'utf8');

    const source = new DatabaseSync(primary.filePath);
    source.prepare('VACUUM INTO ?').run(spaceDatabasePath);
    source.close();

    const result = await createBackup({
      databaseFilePath: spaceDatabasePath,
      uploadDir: spaceUploads,
      backupDir: path.join(spaceRoot, 'backups'),
      now: new Date('2026-10-21T15:00:00.000Z'),
    });

    expect(result.manifest.tables.Person).toBe(1);
    expect(result.manifest.uploads.fileCount).toBe(1);
  });
});

describe('backup CLI', () => {
  function databaseUrl(filePath: string): string {
    const schemaDir = path.join(projectRoot, 'server/prisma');
    return `file:./${path
      .relative(schemaDir, filePath)
      .split(path.sep)
      .join('/')}`;
  }

  function projectUrl(filePath: string): string {
    return `./${path.relative(projectRoot, filePath).split(path.sep).join('/')}`;
  }

  it('runs successfully and keeps secrets out of the backup', () => {
    const cliBackupDir = path.join(tmpRoot, 'cli-backups');
    const secret = `cli-secret-${process.pid}-${Date.now()}`;
    const apiKey = `cli-api-${process.pid}-${Date.now()}`;
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/backup.ts'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: databaseUrl(primary.filePath),
          UPLOAD_DIR: projectUrl(uploadDir),
          BACKUP_DIR: projectUrl(cliBackupDir),
          JWT_SECRET: secret,
          AI_API_KEY: apiKey,
        },
        encoding: 'utf8',
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('[backup] OK');

    const directories = readdirSync(cliBackupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(directories).toHaveLength(1);

    const setDir = path.join(cliBackupDir, directories[0]);
    const manifestText = readFileSync(path.join(setDir, 'manifest.json'), 'utf8');
    expect(manifestText).not.toContain(secret);
    expect(manifestText).not.toContain(apiKey);
    expect(existsSync(path.join(setDir, '.env'))).toBe(false);
    expect(manifestText).not.toContain(projectRoot);
  });

  it('exits non-zero with a stable error code when the database is missing', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/backup.ts'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: `file:./.tmp/${relativeTmp}/missing-cli.db`,
          UPLOAD_DIR: projectUrl(uploadDir),
          BACKUP_DIR: projectUrl(path.join(tmpRoot, 'cli-missing-backups')),
        },
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('BACKUP_DATABASE_MISSING');
  });
});
