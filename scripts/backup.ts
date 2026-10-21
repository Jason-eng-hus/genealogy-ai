import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  isPathInsideProject,
  isSameOrNestedDirectory,
  loadDatabaseConfig,
  loadStorageConfig,
  projectRelativePath,
} from '../server/src/config/env.ts';
import { formatCliError } from './support/cli-error.ts';

export type BackupErrorCode =
  | 'BACKUP_DATABASE_MISSING'
  | 'BACKUP_DIR_INVALID'
  | 'BACKUP_FAILED'
  | 'BACKUP_VERIFY_FAILED';

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(
    code: BackupErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BackupError';
    this.code = code;
  }
}

export const BACKUP_TABLES = [
  'AiDraft',
  'AiJob',
  'AuditLog',
  'Citation',
  'ConsistencyIssue',
  'Event',
  'Family',
  'GedcomImport',
  'GedcomXref',
  'Narrative',
  'Person',
  'Relation',
  'ReviewRequest',
  'Source',
  'User',
] as const;

export const BACKUP_DATABASE_FILE = 'genealogy.db';
export const BACKUP_UPLOADS_DIRECTORY = 'uploads';
export const BACKUP_MANIFEST_FILE = 'manifest.json';

export interface BackupManifest {
  formatVersion: 1;
  createdAt: string;
  database: {
    file: string;
    sizeBytes: number;
    sha256: string;
  };
  uploads: {
    directory: string;
    fileCount: number;
    totalBytes: number;
  };
  tables: Record<string, number>;
}

export interface CreateBackupOptions {
  databaseFilePath?: string;
  uploadDir?: string;
  backupDir?: string;
  now?: Date;
}

export interface BackupResult {
  backupDir: string;
  manifest: BackupManifest;
}

interface BackupPaths {
  databaseFilePath: string;
  uploadDir: string;
  backupDir: string;
}

interface UploadStats {
  fileCount: number;
  totalBytes: number;
}

function assertInsideProject(directory: string, variable: string): void {
  if (!isPathInsideProject(directory)) {
    throw new BackupError(
      'BACKUP_DIR_INVALID',
      `${variable} must point inside the project directory.`,
    );
  }
}

function ensureDirectoryUsable(directory: string, variable: string): void {
  if (existsSync(directory) && !statSync(directory).isDirectory()) {
    throw new BackupError(
      'BACKUP_DIR_INVALID',
      `${variable} exists but is not a directory.`,
    );
  }
}

function resolveBackupPaths(options: CreateBackupOptions): BackupPaths {
  const databaseFilePath = path.resolve(
    options.databaseFilePath ?? loadDatabaseConfig().databaseFilePath,
  );
  const storage =
    options.uploadDir === undefined || options.backupDir === undefined
      ? loadStorageConfig()
      : null;
  const uploadDir = path.resolve(options.uploadDir ?? storage!.uploadDir);
  const backupDir = path.resolve(options.backupDir ?? storage!.backupDir);

  assertInsideProject(uploadDir, 'UPLOAD_DIR');
  assertInsideProject(backupDir, 'BACKUP_DIR');
  ensureDirectoryUsable(uploadDir, 'UPLOAD_DIR');
  ensureDirectoryUsable(backupDir, 'BACKUP_DIR');

  if (
    isSameOrNestedDirectory(uploadDir, backupDir) ||
    isSameOrNestedDirectory(backupDir, uploadDir)
  ) {
    throw new BackupError(
      'BACKUP_DIR_INVALID',
      'UPLOAD_DIR and BACKUP_DIR must not be the same directory or nested.',
    );
  }

  if (isSameOrNestedDirectory(uploadDir, databaseFilePath)) {
    throw new BackupError(
      'BACKUP_DIR_INVALID',
      'The database file must not be inside UPLOAD_DIR.',
    );
  }

  let databaseStat;
  try {
    databaseStat = statSync(databaseFilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new BackupError(
        'BACKUP_DATABASE_MISSING',
        'Database file does not exist; run migrations before backing up.',
        { cause: error },
      );
    }

    throw new BackupError(
      'BACKUP_FAILED',
      'Unable to inspect the database file.',
      { cause: error },
    );
  }

  if (!databaseStat.isFile()) {
    throw new BackupError(
      'BACKUP_DATABASE_MISSING',
      'Database path is not a regular file.',
    );
  }

  return { databaseFilePath, uploadDir, backupDir };
}

function createBackupDirectory(backupRoot: string, now: Date): string {
  try {
    mkdirSync(backupRoot, { recursive: true });
  } catch (error) {
    throw new BackupError(
      'BACKUP_DIR_INVALID',
      'Unable to create the backup directory.',
      { cause: error },
    );
  }

  const stamp = now.toISOString().replace(/[:.]/g, '-');
  let candidate = path.join(backupRoot, stamp);
  let suffix = 2;

  while (existsSync(candidate)) {
    candidate = path.join(backupRoot, `${stamp}-${suffix}`);
    suffix += 1;
  }

  try {
    mkdirSync(candidate);
  } catch (error) {
    throw new BackupError('BACKUP_FAILED', 'Unable to create the backup set directory.', {
      cause: error,
    });
  }

  return candidate;
}

function readTableCounts(database: DatabaseSync): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const row = database
      .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
      .get() as { count: number | bigint };
    counts[table] = Number(row.count);
  }

  return counts;
}

function snapshotDatabase(
  databaseFilePath: string,
  backupDatabasePath: string,
): Record<string, number> {
  let database: DatabaseSync | null = null;

  try {
    database = new DatabaseSync(databaseFilePath);
    database.exec('PRAGMA busy_timeout = 5000');
    const counts = readTableCounts(database);
    database.prepare('VACUUM INTO ?').run(backupDatabasePath);
    return counts;
  } catch (error) {
    throw new BackupError(
      'BACKUP_FAILED',
      'Unable to create a consistent database snapshot; verify the database is migrated and not locked.',
      { cause: error },
    );
  } finally {
    database?.close();
  }
}

function copyUploads(sourceDir: string, targetDir: string): UploadStats {
  const stats: UploadStats = { fileCount: 0, totalBytes: 0 };

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (error) {
    throw new BackupError('BACKUP_FAILED', 'Unable to create the backup uploads directory.', {
      cause: error,
    });
  }

  if (!existsSync(sourceDir)) {
    return stats;
  }

  if (!lstatSync(sourceDir).isDirectory()) {
    throw new BackupError('BACKUP_DIR_INVALID', 'UPLOAD_DIR is not a directory.');
  }

  const walk = (currentSource: string, currentTarget: string): void => {
    for (const entry of readdirSync(currentSource, { withFileTypes: true })) {
      const sourcePath = path.join(currentSource, entry.name);
      const targetPath = path.join(currentTarget, entry.name);
      const sourceStat = lstatSync(sourcePath);

      if (sourceStat.isSymbolicLink()) {
        throw new BackupError(
          'BACKUP_FAILED',
          `Refusing to back up symbolic link "${entry.name}".`,
        );
      }

      if (sourceStat.isDirectory()) {
        mkdirSync(targetPath);
        walk(sourcePath, targetPath);
        continue;
      }

      if (!sourceStat.isFile()) {
        throw new BackupError(
          'BACKUP_FAILED',
          `Refusing to back up unsupported upload entry "${entry.name}".`,
        );
      }

      copyFileSync(sourcePath, targetPath);
      stats.fileCount += 1;
      stats.totalBytes += sourceStat.size;
    }
  };

  walk(sourceDir, targetDir);
  return stats;
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function verifyIntegrity(backupDatabasePath: string): void {
  let database: DatabaseSync | null = null;

  try {
    database = new DatabaseSync(backupDatabasePath);
    const rows = database.prepare('PRAGMA integrity_check').all() as Array<
      Record<string, unknown>
    >;
    const results = rows.map((row) => String(Object.values(row)[0]));

    if (results.length !== 1 || results[0] !== 'ok') {
      throw new BackupError(
        'BACKUP_VERIFY_FAILED',
        `Backup database failed integrity_check: ${results.join('; ')}.`,
      );
    }
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }

    throw new BackupError(
      'BACKUP_VERIFY_FAILED',
      'Unable to verify the backup database.',
      { cause: error },
    );
  } finally {
    database?.close();
  }
}

async function verifyBackup(
  backupDir: string,
  manifest: BackupManifest,
  expectedCounts: Record<string, number>,
  expectedUploads: UploadStats,
): Promise<void> {
  const backupDatabasePath = path.join(backupDir, BACKUP_DATABASE_FILE);

  verifyIntegrity(backupDatabasePath);

  let database: DatabaseSync | null = null;

  try {
    database = new DatabaseSync(backupDatabasePath);
    const counts = readTableCounts(database);

    for (const table of BACKUP_TABLES) {
      if (counts[table] !== expectedCounts[table]) {
        throw new BackupError(
          'BACKUP_VERIFY_FAILED',
          `Row count mismatch for table "${table}": expected ${expectedCounts[table]}, got ${counts[table]}.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }

    throw new BackupError(
      'BACKUP_VERIFY_FAILED',
      'Unable to compare backup table counts.',
      { cause: error },
    );
  } finally {
    database?.close();
  }

  const databaseStat = statSync(backupDatabasePath);

  if (databaseStat.size !== manifest.database.sizeBytes) {
    throw new BackupError(
      'BACKUP_VERIFY_FAILED',
      'Backup database size does not match the manifest.',
    );
  }

  if ((await sha256File(backupDatabasePath)) !== manifest.database.sha256) {
    throw new BackupError(
      'BACKUP_VERIFY_FAILED',
      'Backup database checksum does not match the manifest.',
    );
  }

  const uploads = countUploads(path.join(backupDir, BACKUP_UPLOADS_DIRECTORY));

  if (
    uploads.fileCount !== expectedUploads.fileCount ||
    uploads.totalBytes !== expectedUploads.totalBytes
  ) {
    throw new BackupError(
      'BACKUP_VERIFY_FAILED',
      'Backup upload file count or size does not match the source.',
    );
  }
}

function countUploads(directory: string): UploadStats {
  const stats: UploadStats = { fileCount: 0, totalBytes: 0 };

  if (!existsSync(directory)) {
    return stats;
  }

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      const entryStat = lstatSync(entryPath);

      if (entryStat.isSymbolicLink()) {
        throw new BackupError(
          'BACKUP_VERIFY_FAILED',
          'Backup uploads contain a symbolic link.',
        );
      }

      if (entryStat.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (!entryStat.isFile()) {
        throw new BackupError(
          'BACKUP_VERIFY_FAILED',
          'Backup uploads contain an unsupported entry.',
        );
      }

      stats.fileCount += 1;
      stats.totalBytes += entryStat.size;
    }
  };

  walk(directory);
  return stats;
}

function writeManifest(
  backupDir: string,
  manifest: BackupManifest,
): void {
  writeFileSync(
    path.join(backupDir, BACKUP_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
}

export async function createBackup(
  options: CreateBackupOptions = {},
): Promise<BackupResult> {
  const paths = resolveBackupPaths(options);
  const now = options.now ?? new Date();
  let backupDir: string | null = null;

  try {
    backupDir = createBackupDirectory(paths.backupDir, now);
    const backupDatabasePath = path.join(backupDir, BACKUP_DATABASE_FILE);
    const counts = snapshotDatabase(paths.databaseFilePath, backupDatabasePath);
    const uploads = copyUploads(
      paths.uploadDir,
      path.join(backupDir, BACKUP_UPLOADS_DIRECTORY),
    );
    const databaseStat = statSync(backupDatabasePath);
    const manifest: BackupManifest = {
      formatVersion: 1,
      createdAt: now.toISOString(),
      database: {
        file: BACKUP_DATABASE_FILE,
        sizeBytes: databaseStat.size,
        sha256: await sha256File(backupDatabasePath),
      },
      uploads: {
        directory: BACKUP_UPLOADS_DIRECTORY,
        fileCount: uploads.fileCount,
        totalBytes: uploads.totalBytes,
      },
      tables: counts,
    };

    writeManifest(backupDir, manifest);
    await verifyBackup(backupDir, manifest, counts, uploads);

    return { backupDir, manifest };
  } catch (error) {
    if (backupDir !== null) {
      rmSync(backupDir, { recursive: true, force: true });
    }

    if (error instanceof BackupError) {
      throw error;
    }

    throw new BackupError('BACKUP_FAILED', 'Backup failed.', { cause: error });
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

async function main(): Promise<void> {
  const result = await createBackup();
  const rowCount = Object.values(result.manifest.tables).reduce(
    (total, count) => total + count,
    0,
  );

  console.log(`[backup] directory ${projectRelativePath(result.backupDir)}`);
  console.log(
    `[backup] database ${result.manifest.database.file} (${result.manifest.database.sizeBytes} bytes)`,
  );
  console.log(
    `[backup] uploads ${result.manifest.uploads.fileCount} file(s), ${result.manifest.uploads.totalBytes} bytes`,
  );
  console.log(`[backup] tables ${rowCount} row(s)`);
  console.log('[backup] OK');
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    console.error(`[backup] FAILED ${formatCliError(error)}`);
    process.exitCode = 1;
  });
}
