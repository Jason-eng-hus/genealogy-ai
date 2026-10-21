import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  UPLOAD_MIME_TYPES,
  type UploadExtension,
} from '../../../shared/src/constants/files.ts';
import {
  loadStorageConfig,
  type StorageConfig,
} from '../config/env.ts';

export type FileStorageErrorCode =
  | 'INVALID_FILE_NAME'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'EMPTY_FILE'
  | 'UPLOAD_TOO_LARGE'
  | 'STORAGE_PATH_INVALID'
  | 'UPLOAD_WRITE_FAILED';

export class FileStorageError extends Error {
  readonly code: FileStorageErrorCode;

  constructor(
    code: FileStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FileStorageError';
    this.code = code;
  }
}

export interface UploadInput {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ValidatedUpload {
  originalName: string;
  extension: UploadExtension;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredUpload extends ValidatedUpload {
  storedName: string;
  storagePath: string;
  sha256: string;
}

function isAllowedExtension(value: string): value is UploadExtension {
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(value);
}

function normalizeMimeType(raw: string): string {
  return raw.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function validateOriginalName(raw: string): string {
  const originalName = raw.trim();

  if (
    originalName === '' ||
    originalName.includes('\0') ||
    originalName.includes('/') ||
    originalName.includes('\\') ||
    originalName.includes('..') ||
    originalName.includes(':') ||
    /[\u0000-\u001f\u007f]/.test(originalName)
  ) {
    throw new FileStorageError(
      'INVALID_FILE_NAME',
      'File name must be a plain name without path separators or control characters.',
    );
  }

  return originalName;
}

export function validateUpload(input: UploadInput): ValidatedUpload {
  const originalName = validateOriginalName(input.originalName);
  const extension = path.extname(originalName).slice(1).toLowerCase();

  if (!isAllowedExtension(extension)) {
    throw new FileStorageError(
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported file type; allowed extensions: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}.`,
    );
  }

  const mimeType = normalizeMimeType(input.mimeType);

  if (!UPLOAD_MIME_TYPES[extension].includes(mimeType)) {
    throw new FileStorageError(
      'UNSUPPORTED_FILE_TYPE',
      `MIME type "${mimeType || 'unknown'}" is not allowed for .${extension} files.`,
    );
  }

  const sizeBytes = input.buffer.byteLength;

  if (sizeBytes === 0) {
    throw new FileStorageError('EMPTY_FILE', 'Uploaded file is empty.');
  }

  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new FileStorageError(
      'UPLOAD_TOO_LARGE',
      `Uploaded file exceeds the ${MAX_UPLOAD_BYTES} byte limit.`,
    );
  }

  return {
    originalName,
    extension,
    mimeType,
    sizeBytes,
  };
}

export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function saveUpload(
  input: UploadInput,
  config: StorageConfig = loadStorageConfig(),
): StoredUpload {
  const validated = validateUpload(input);
  const storedName = `${randomUUID()}.${validated.extension}`;
  const tempName = `.upload-${randomUUID()}.tmp`;
  const targetPath = path.join(config.uploadDir, storedName);
  const tempPath = path.join(config.uploadDir, tempName);

  try {
    mkdirSync(config.uploadDir, { recursive: true });
  } catch (error) {
    throw new FileStorageError(
      'UPLOAD_WRITE_FAILED',
      'Unable to create the upload directory.',
      { cause: error },
    );
  }

  try {
    writeFileSync(tempPath, input.buffer, { flag: 'wx', mode: 0o600 });
    renameSync(tempPath, targetPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw new FileStorageError(
      'UPLOAD_WRITE_FAILED',
      'Unable to store the uploaded file.',
      { cause: error },
    );
  }

  return {
    ...validated,
    storedName,
    storagePath: storedName,
    sha256: computeSha256(input.buffer),
  };
}

export function resolveStoredFile(
  storagePath: string,
  config: StorageConfig = loadStorageConfig(),
): string {
  if (
    storagePath === '' ||
    storagePath.includes('\0') ||
    storagePath.startsWith('.') ||
    storagePath.includes('/') ||
    storagePath.includes('\\') ||
    path.isAbsolute(storagePath) ||
    path.basename(storagePath) !== storagePath
  ) {
    throw new FileStorageError(
      'STORAGE_PATH_INVALID',
      'Stored file path must be a plain file name inside the upload directory.',
    );
  }

  const resolved = path.resolve(config.uploadDir, storagePath);
  const relative = path.relative(path.resolve(config.uploadDir), resolved);

  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new FileStorageError(
      'STORAGE_PATH_INVALID',
      'Stored file path must stay inside the upload directory.',
    );
  }

  return resolved;
}
