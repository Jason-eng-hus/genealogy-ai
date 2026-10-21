import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  type UploadExtension,
} from '../../shared/src/constants/files.ts';
import { PROJECT_ROOT, type StorageConfig } from '../src/config/env.ts';
import {
  FileStorageError,
  computeSha256,
  resolveStoredFile,
  saveUpload,
  validateUpload,
  type FileStorageErrorCode,
  type UploadInput,
} from '../src/services/files.ts';

const tmpRoot = path.join(
  PROJECT_ROOT,
  'server/prisma/.tmp',
  `files-${process.pid}-${Date.now()}`,
);
let configSequence = 0;

function createStorageConfig(label: string): StorageConfig {
  configSequence += 1;
  const root = path.join(tmpRoot, `${configSequence}-${label}`);

  return {
    uploadDir: path.join(root, 'uploads'),
    backupDir: path.join(root, 'backups'),
    projectRoot: PROJECT_ROOT,
  };
}

function uploadInput(
  originalName: string,
  mimeType: string,
  buffer: Buffer = Buffer.from('content'),
): UploadInput {
  return { originalName, mimeType, buffer };
}

function fileErrorCode(fn: () => unknown): FileStorageErrorCode | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof FileStorageError) {
      return error.code;
    }

    throw error;
  }
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('validateUpload', () => {
  it('accepts every whitelisted extension with an allowed MIME type', () => {
    const cases: Array<[string, string, UploadExtension]> = [
      ['scan.jpg', 'image/jpeg', 'jpg'],
      ['scan.jpeg', 'image/jpeg', 'jpeg'],
      ['scan.png', 'image/png', 'png'],
      ['scan.webp', 'image/webp', 'webp'],
      ['notes.txt', 'text/plain; charset=utf-8', 'txt'],
      ['tree.ged', 'text/plain', 'ged'],
      ['tree.ged', 'application/x-gedcom', 'ged'],
      ['tree.ged', 'text/vnd.familysearch.gedcom', 'ged'],
      ['tree.ged', 'application/octet-stream', 'ged'],
      ['家谱 扫描.PNG', 'IMAGE/PNG', 'png'],
    ];

    for (const [originalName, mimeType, extension] of cases) {
      const validated = validateUpload(uploadInput(originalName, mimeType));

      expect(validated.originalName).toBe(originalName.trim());
      expect(validated.extension).toBe(extension);
      expect(validated.mimeType).toBe(mimeType.split(';', 1)[0].toLowerCase());
      expect(validated.sizeBytes).toBe(Buffer.byteLength('content'));
    }
  });

  it('rejects path separators, traversal, control characters, and drive prefixes', () => {
    const names = [
      '../evil.png',
      '..\\evil.png',
      '/absolute.png',
      'C:\\absolute.png',
      'nested/scan.png',
      'nested\\scan.png',
      'scan\0.png',
      'scan\n.png',
      '..',
      '',
      '   ',
    ];

    for (const originalName of names) {
      expect(
        fileErrorCode(() => validateUpload(uploadInput(originalName, 'image/png'))),
        originalName,
      ).toBe('INVALID_FILE_NAME');
    }
  });

  it('rejects extensions outside the whitelist', () => {
    for (const originalName of ['scan.exe', 'scan.svg', 'scan', 'archive.tar.gz']) {
      expect(
        fileErrorCode(() => validateUpload(uploadInput(originalName, 'image/png'))),
        originalName,
      ).toBe('UNSUPPORTED_FILE_TYPE');
    }
  });

  it('rejects MIME types that do not match the extension', () => {
    const cases: Array<[string, string]> = [
      ['scan.png', 'image/jpeg'],
      ['scan.jpg', 'image/png'],
      ['scan.jpg', 'image/jpg'],
      ['notes.txt', 'application/octet-stream'],
      ['tree.ged', 'image/png'],
      ['scan.png', ''],
    ];

    for (const [originalName, mimeType] of cases) {
      expect(
        fileErrorCode(() => validateUpload(uploadInput(originalName, mimeType))),
        `${originalName} ${mimeType}`,
      ).toBe('UNSUPPORTED_FILE_TYPE');
    }
  });

  it('rejects empty files', () => {
    expect(
      fileErrorCode(() =>
        validateUpload(uploadInput('scan.png', 'image/png', Buffer.alloc(0))),
      ),
    ).toBe('EMPTY_FILE');
  });

  it('accepts exactly 10MB and rejects one byte more', () => {
    const exactly = validateUpload(
      uploadInput('scan.png', 'image/png', Buffer.alloc(MAX_UPLOAD_BYTES)),
    );
    expect(exactly.sizeBytes).toBe(MAX_UPLOAD_BYTES);

    expect(
      fileErrorCode(() =>
        validateUpload(
          uploadInput('scan.png', 'image/png', Buffer.alloc(MAX_UPLOAD_BYTES + 1)),
        ),
      ),
    ).toBe('UPLOAD_TOO_LARGE');
  });
});

describe('saveUpload', () => {
  it('stores a file under a random name and returns its hash', () => {
    const config = createStorageConfig('save');
    const buffer = Buffer.from('old genealogy text');
    const stored = saveUpload(
      uploadInput('old-family.txt', 'text/plain', buffer),
      config,
    );

    expect(stored.originalName).toBe('old-family.txt');
    expect(stored.storedName).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txt$/i,
    );
    expect(stored.storagePath).toBe(stored.storedName);
    expect(stored.storagePath).not.toContain('/');
    expect(stored.storagePath).not.toContain('\\');
    expect(stored.sha256).toBe(computeSha256(buffer));
    expect(stored.sizeBytes).toBe(buffer.byteLength);

    const storedPath = path.join(config.uploadDir, stored.storedName);
    expect(existsSync(storedPath)).toBe(true);
    expect(readFileSync(storedPath)).toEqual(buffer);
    expect(readdirSync(config.uploadDir)).toEqual([stored.storedName]);
  });

  it('never reuses a stored name and keeps original names out of the path', () => {
    const config = createStorageConfig('random');
    const first = saveUpload(
      uploadInput('same-name.png', 'image/png'),
      config,
    );
    const second = saveUpload(
      uploadInput('same-name.png', 'image/png'),
      config,
    );

    expect(first.storedName).not.toBe(second.storedName);
    expect(first.storagePath).not.toContain('same-name');
    expect(readdirSync(config.uploadDir).sort()).toEqual(
      [first.storedName, second.storedName].sort(),
    );
  });

  it('creates the upload directory recursively', () => {
    const config = createStorageConfig('nested/create');
    const stored = saveUpload(uploadInput('tree.ged', 'text/plain'), config);

    expect(existsSync(config.uploadDir)).toBe(true);
    expect(existsSync(path.join(config.uploadDir, stored.storedName))).toBe(true);
  });

  it('fails with UPLOAD_WRITE_FAILED when the upload path is not a directory', () => {
    const config = createStorageConfig('blocked');
    mkdirSync(path.dirname(config.uploadDir), { recursive: true });
    writeFileSync(config.uploadDir, 'not a directory', 'utf8');

    expect(
      fileErrorCode(() =>
        saveUpload(uploadInput('scan.png', 'image/png'), config),
      ),
    ).toBe('UPLOAD_WRITE_FAILED');
  });
});

describe('resolveStoredFile', () => {
  it('resolves a stored file inside the upload directory', () => {
    const config = createStorageConfig('resolve');
    const stored = saveUpload(uploadInput('scan.png', 'image/png'), config);

    expect(resolveStoredFile(stored.storagePath, config)).toBe(
      path.join(path.resolve(config.uploadDir), stored.storedName),
    );
  });

  it('rejects absolute paths, directories, traversal, and hidden names', () => {
    const config = createStorageConfig('reject');
    const invalid = [
      '',
      '.',
      '..',
      '.env',
      '.hidden.txt',
      '../scan.png',
      '..\\scan.png',
      'nested/scan.png',
      'nested\\scan.png',
      'scan\0.png',
      path.join(config.uploadDir, 'scan.png'),
    ];

    for (const storagePath of invalid) {
      expect(
        fileErrorCode(() => resolveStoredFile(storagePath, config)),
        storagePath,
      ).toBe('STORAGE_PATH_INVALID');
    }
  });
});
