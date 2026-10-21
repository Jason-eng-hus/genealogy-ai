import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKUP_DIR,
  DEFAULT_UPLOAD_DIR,
  PROJECT_ROOT,
  StorageConfigError,
  loadStorageConfig,
  resolveStorageConfig,
  type StorageConfigErrorCode,
} from '../src/config/env.ts';

const tmpDir = path.join(
  PROJECT_ROOT,
  'server/prisma/.tmp',
  `storage-config-${process.pid}-${Date.now()}`,
);

function storageErrorCode(fn: () => unknown): StorageConfigErrorCode | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof StorageConfigError) {
      return error.code;
    }

    throw error;
  }
}

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('storage configuration', () => {
  it('defaults upload and backup directories inside the project', () => {
    const config = resolveStorageConfig({});

    expect(config.projectRoot).toBe(PROJECT_ROOT);
    expect(config.uploadDir).toBe(DEFAULT_UPLOAD_DIR);
    expect(config.backupDir).toBe(DEFAULT_BACKUP_DIR);
    expect(config.uploadDir).toBe(path.join(PROJECT_ROOT, 'data', 'uploads'));
    expect(config.backupDir).toBe(path.join(PROJECT_ROOT, 'data', 'backups'));
  });

  it('resolves relative directories against the project root', () => {
    const config = resolveStorageConfig({
      UPLOAD_DIR: './server/prisma/.tmp/relative-uploads',
      BACKUP_DIR: './server/prisma/.tmp/relative-backups',
    });

    expect(config.uploadDir).toBe(
      path.join(PROJECT_ROOT, 'server/prisma/.tmp/relative-uploads'),
    );
    expect(config.backupDir).toBe(
      path.join(PROJECT_ROOT, 'server/prisma/.tmp/relative-backups'),
    );
  });

  it('accepts absolute directories inside the project', () => {
    const uploadDir = path.join(PROJECT_ROOT, 'server/prisma/.tmp/absolute-uploads');
    const backupDir = path.join(PROJECT_ROOT, 'server/prisma/.tmp/absolute-backups');
    const config = resolveStorageConfig({
      UPLOAD_DIR: uploadDir,
      BACKUP_DIR: backupDir,
    });

    expect(config.uploadDir).toBe(path.resolve(uploadDir));
    expect(config.backupDir).toBe(path.resolve(backupDir));
  });

  it('preserves spaces in directory names', () => {
    const config = resolveStorageConfig({
      UPLOAD_DIR: './server/prisma/.tmp/storage with space/uploads',
      BACKUP_DIR: './server/prisma/.tmp/storage with space/backups',
    });

    expect(config.uploadDir).toBe(
      path.join(PROJECT_ROOT, 'server/prisma/.tmp/storage with space/uploads'),
    );
    expect(config.backupDir).toBe(
      path.join(PROJECT_ROOT, 'server/prisma/.tmp/storage with space/backups'),
    );
  });

  it('falls back to defaults for blank values', () => {
    const config = resolveStorageConfig({
      UPLOAD_DIR: '   ',
      BACKUP_DIR: '',
    });

    expect(config.uploadDir).toBe(DEFAULT_UPLOAD_DIR);
    expect(config.backupDir).toBe(DEFAULT_BACKUP_DIR);
  });

  it('rejects directories outside the project', () => {
    const outside = path.resolve(PROJECT_ROOT, '..', 'outside-storage');

    expect(
      storageErrorCode(() =>
        resolveStorageConfig({ UPLOAD_DIR: outside, BACKUP_DIR: DEFAULT_BACKUP_DIR }),
      ),
    ).toBe('STORAGE_DIR_OUTSIDE_PROJECT');
    expect(
      storageErrorCode(() =>
        resolveStorageConfig({ UPLOAD_DIR: DEFAULT_UPLOAD_DIR, BACKUP_DIR: outside }),
      ),
    ).toBe('STORAGE_DIR_OUTSIDE_PROJECT');
  });

  it('rejects the project root itself as a storage directory', () => {
    expect(
      storageErrorCode(() =>
        resolveStorageConfig({ UPLOAD_DIR: '.', BACKUP_DIR: DEFAULT_BACKUP_DIR }),
      ),
    ).toBe('STORAGE_DIR_OUTSIDE_PROJECT');
  });

  it('rejects NUL characters in directory paths', () => {
    expect(
      storageErrorCode(() =>
        resolveStorageConfig({
          UPLOAD_DIR: './data/\0uploads',
          BACKUP_DIR: DEFAULT_BACKUP_DIR,
        }),
      ),
    ).toBe('STORAGE_DIR_INVALID');
  });

  it('rejects identical upload and backup directories', () => {
    expect(
      storageErrorCode(() =>
        resolveStorageConfig({
          UPLOAD_DIR: './server/prisma/.tmp/shared',
          BACKUP_DIR: './server/prisma/.tmp/shared',
        }),
      ),
    ).toBe('STORAGE_DIR_CONFLICT');
  });

  it('rejects nested upload and backup directories in both directions', () => {
    expect(
      storageErrorCode(() =>
        resolveStorageConfig({
          UPLOAD_DIR: './server/prisma/.tmp/nested',
          BACKUP_DIR: './server/prisma/.tmp/nested/backups',
        }),
      ),
    ).toBe('STORAGE_DIR_CONFLICT');
    expect(
      storageErrorCode(() =>
        resolveStorageConfig({
          UPLOAD_DIR: './server/prisma/.tmp/nested/uploads',
          BACKUP_DIR: './server/prisma/.tmp/nested',
        }),
      ),
    ).toBe('STORAGE_DIR_CONFLICT');
  });

  it('loads storage variables from an env file', () => {
    mkdirSync(tmpDir, { recursive: true });
    const envPath = path.join(tmpDir, 'storage.env');
    writeFileSync(
      envPath,
      'UPLOAD_DIR=./server/prisma/.tmp/from-env-uploads\nBACKUP_DIR=./server/prisma/.tmp/from-env-backups\n',
      'utf8',
    );

    const env: NodeJS.ProcessEnv = {};
    const config = loadStorageConfig({ dotEnvPath: envPath, env });

    expect(config.uploadDir).toBe(
      path.join(PROJECT_ROOT, 'server/prisma/.tmp/from-env-uploads'),
    );
    expect(config.backupDir).toBe(
      path.join(PROJECT_ROOT, 'server/prisma/.tmp/from-env-backups'),
    );
    expect(env.UPLOAD_DIR).toBe('./server/prisma/.tmp/from-env-uploads');
  });

  it('ignores a missing env file', () => {
    const config = loadStorageConfig({
      dotEnvPath: path.join(tmpDir, 'does-not-exist.env'),
      env: {},
    });

    expect(config.uploadDir).toBe(DEFAULT_UPLOAD_DIR);
    expect(config.backupDir).toBe(DEFAULT_BACKUP_DIR);
  });
});
