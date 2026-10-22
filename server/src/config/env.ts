import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
export const SCHEMA_DIR = path.join(PROJECT_ROOT, 'server', 'prisma');
export const DATABASE_BUSY_TIMEOUT_MS = 5000;
export const DEFAULT_UPLOAD_DIR = path.join(PROJECT_ROOT, 'data', 'uploads');
export const DEFAULT_BACKUP_DIR = path.join(PROJECT_ROOT, 'data', 'backups');

export const APP_ENVS = ['development', 'test', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type ServerConfigErrorCode =
  | 'PORT_INVALID'
  | 'HOST_INVALID'
  | 'TRUST_PROXY_INVALID'
  | 'LOG_LEVEL_INVALID';

export class ServerConfigError extends Error {
  readonly code: ServerConfigErrorCode;

  constructor(
    code: ServerConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ServerConfigError';
    this.code = code;
  }
}

export interface ServerConfig {
  appEnv: AppEnv;
  host: string;
  port: number;
  trustProxy: boolean | number;
  logLevel: LogLevel;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
}

export interface LoadAppConfigOptions {
  dotEnvPath?: string;
  env?: NodeJS.ProcessEnv;
  loadDotEnvFile?: boolean;
}

export type DatabaseConfigErrorCode =
  | 'ENV_FILE_UNREADABLE'
  | 'NODE_ENV_INVALID'
  | 'DATABASE_URL_MISSING'
  | 'DATABASE_URL_NOT_FILE'
  | 'DATABASE_URL_EMPTY_PATH'
  | 'DATABASE_URL_IN_MEMORY'
  | 'DATABASE_URL_INVALID';

export class DatabaseConfigError extends Error {
  readonly code: DatabaseConfigErrorCode;

  constructor(
    code: DatabaseConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DatabaseConfigError';
    this.code = code;
  }
}

export interface DatabaseConfig {
  appEnv: AppEnv;
  databaseUrl: string;
  databaseFilePath: string;
  projectRoot: string;
  schemaDir: string;
  busyTimeoutMs: number;
}

export interface LoadDatabaseConfigOptions {
  dotEnvPath?: string;
  env?: NodeJS.ProcessEnv;
  loadDotEnvFile?: boolean;
}

export type StorageConfigErrorCode =
  | 'STORAGE_DIR_INVALID'
  | 'STORAGE_DIR_OUTSIDE_PROJECT'
  | 'STORAGE_DIR_CONFLICT';

export class StorageConfigError extends Error {
  readonly code: StorageConfigErrorCode;

  constructor(
    code: StorageConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StorageConfigError';
    this.code = code;
  }
}

export interface StorageConfig {
  uploadDir: string;
  backupDir: string;
  projectRoot: string;
}

export interface LoadStorageConfigOptions {
  dotEnvPath?: string;
  env?: NodeJS.ProcessEnv;
  loadDotEnvFile?: boolean;
}

export function loadEnvFile(
  filePath: string,
  target: NodeJS.ProcessEnv = process.env,
): void {
  let content: string;

  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw new DatabaseConfigError(
      'ENV_FILE_UNREADABLE',
      `Unable to read environment file "${path.basename(filePath)}".`,
      { cause: error },
    );
  }

  let parsed: Record<string, string | undefined>;

  try {
    parsed = parseEnv(content);
  } catch (error) {
    throw new DatabaseConfigError(
      'ENV_FILE_UNREADABLE',
      `Unable to parse environment file "${path.basename(filePath)}".`,
      { cause: error },
    );
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && target[key] === undefined) {
      target[key] = value;
    }
  }
}

function resolveAppEnv(raw: string | undefined): AppEnv {
  const value = raw?.trim();

  if (!value) {
    return 'development';
  }

  if (!APP_ENVS.includes(value as AppEnv)) {
    throw new DatabaseConfigError(
      'NODE_ENV_INVALID',
      `NODE_ENV must be one of: ${APP_ENVS.join(', ')}.`,
    );
  }

  return value as AppEnv;
}

function resolvePort(raw: string | undefined): number {
  const value = raw?.trim();

  if (!value) {
    return 4000;
  }

  if (!/^\d+$/.test(value)) {
    throw new ServerConfigError(
      'PORT_INVALID',
      'PORT must be an integer between 0 and 65535.',
    );
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ServerConfigError(
      'PORT_INVALID',
      'PORT must be an integer between 0 and 65535.',
    );
  }

  return port;
}

function resolveHost(raw: string | undefined): string {
  const value = raw?.trim();

  if (!value) {
    return '127.0.0.1';
  }

  if (value !== 'localhost' && isIP(value) === 0) {
    throw new ServerConfigError(
      'HOST_INVALID',
      'HOST must be "localhost" or a valid IPv4/IPv6 address.',
    );
  }

  return value;
}

function resolveTrustProxy(raw: string | undefined): boolean | number {
  const value = raw?.trim().toLowerCase();

  if (!value || value === 'false') {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  throw new ServerConfigError(
    'TRUST_PROXY_INVALID',
    'TRUST_PROXY must be "true", "false", or a non-negative integer hop count.',
  );
}

function resolveLogLevel(raw: string | undefined): LogLevel {
  const value = raw?.trim().toLowerCase();

  if (!value) {
    return 'info';
  }

  if (!LOG_LEVELS.includes(value as LogLevel)) {
    throw new ServerConfigError(
      'LOG_LEVEL_INVALID',
      `LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}.`,
    );
  }

  return value as LogLevel;
}

export function resolveServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  return {
    appEnv: resolveAppEnv(env.NODE_ENV),
    host: resolveHost(env.HOST),
    port: resolvePort(env.PORT),
    trustProxy: resolveTrustProxy(env.TRUST_PROXY),
    logLevel: resolveLogLevel(env.LOG_LEVEL),
  };
}

function resolveDatabaseFilePath(pathPart: string): string {
  if (pathPart === ':memory:' || pathPart.startsWith(':memory:')) {
    throw new DatabaseConfigError(
      'DATABASE_URL_IN_MEMORY',
      'In-memory SQLite databases are not supported; use a file path.',
    );
  }

  if (pathPart.includes('\0')) {
    throw new DatabaseConfigError(
      'DATABASE_URL_INVALID',
      'DATABASE_URL contains an invalid file path.',
    );
  }

  let normalized = pathPart;
  const driveWithLeadingSlashes = normalized.match(/^\/+([A-Za-z]:[\\/].*)$/);

  if (driveWithLeadingSlashes) {
    normalized = driveWithLeadingSlashes[1];
  }

  if (/^[A-Za-z]:(?![\\/])/.test(normalized)) {
    throw new DatabaseConfigError(
      'DATABASE_URL_INVALID',
      'DATABASE_URL contains a drive-relative path; use an absolute or schema-relative path.',
    );
  }

  return path.isAbsolute(normalized)
    ? path.normalize(normalized)
    : path.resolve(SCHEMA_DIR, normalized);
}

function parseDatabaseUrl(raw: string): {
  databaseUrl: string;
  databaseFilePath: string;
} {
  const databaseUrl = raw.trim();

  if (!databaseUrl.startsWith('file:')) {
    throw new DatabaseConfigError(
      'DATABASE_URL_NOT_FILE',
      'DATABASE_URL must use the SQLite "file:" scheme.',
    );
  }

  const remainder = databaseUrl.slice('file:'.length);
  const queryIndex = remainder.indexOf('?');
  const pathPart = queryIndex === -1 ? remainder : remainder.slice(0, queryIndex);

  if (pathPart.trim() === '') {
    throw new DatabaseConfigError(
      'DATABASE_URL_EMPTY_PATH',
      'DATABASE_URL must contain a database file path.',
    );
  }

  return {
    databaseUrl,
    // Prisma resolves relative SQLite URLs against the schema directory.
    databaseFilePath: resolveDatabaseFilePath(pathPart),
  };
}

export function resolveDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const appEnv = resolveAppEnv(env.NODE_ENV);
  const rawDatabaseUrl = env.DATABASE_URL?.trim();

  if (!rawDatabaseUrl) {
    throw new DatabaseConfigError(
      'DATABASE_URL_MISSING',
      'DATABASE_URL is required.',
    );
  }

  const { databaseUrl, databaseFilePath } = parseDatabaseUrl(rawDatabaseUrl);

  return {
    appEnv,
    databaseUrl,
    databaseFilePath,
    projectRoot: PROJECT_ROOT,
    schemaDir: SCHEMA_DIR,
    busyTimeoutMs: DATABASE_BUSY_TIMEOUT_MS,
  };
}

export function loadDatabaseConfig(
  options: LoadDatabaseConfigOptions = {},
): DatabaseConfig {
  const env = options.env ?? process.env;

  if (options.loadDotEnvFile !== false) {
    loadEnvFile(options.dotEnvPath ?? path.join(PROJECT_ROOT, '.env'), env);
  }

  return resolveDatabaseConfig(env);
}

export function resolveAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return {
    server: resolveServerConfig(env),
    database: resolveDatabaseConfig(env),
  };
}

export function loadAppConfig(
  options: LoadAppConfigOptions = {},
): AppConfig {
  const env = options.env ?? process.env;

  if (options.loadDotEnvFile !== false) {
    loadEnvFile(options.dotEnvPath ?? path.join(PROJECT_ROOT, '.env'), env);
  }

  return resolveAppConfig(env);
}

export function isSameOrNestedDirectory(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));

  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function resolveStorageDir(
  raw: string | undefined,
  fallback: string,
  variable: 'UPLOAD_DIR' | 'BACKUP_DIR',
): string {
  const value = raw?.trim();

  if (!value) {
    return fallback;
  }

  if (value.includes('\0')) {
    throw new StorageConfigError(
      'STORAGE_DIR_INVALID',
      `${variable} contains an invalid path.`,
    );
  }

  const resolved = path.resolve(PROJECT_ROOT, value);

  if (!isPathInsideProject(resolved)) {
    throw new StorageConfigError(
      'STORAGE_DIR_OUTSIDE_PROJECT',
      `${variable} must point inside the project directory.`,
    );
  }

  return resolved;
}

export function resolveStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): StorageConfig {
  const uploadDir = resolveStorageDir(
    env.UPLOAD_DIR,
    DEFAULT_UPLOAD_DIR,
    'UPLOAD_DIR',
  );
  const backupDir = resolveStorageDir(
    env.BACKUP_DIR,
    DEFAULT_BACKUP_DIR,
    'BACKUP_DIR',
  );

  if (
    isSameOrNestedDirectory(uploadDir, backupDir) ||
    isSameOrNestedDirectory(backupDir, uploadDir)
  ) {
    throw new StorageConfigError(
      'STORAGE_DIR_CONFLICT',
      'UPLOAD_DIR and BACKUP_DIR must not be the same directory or nested.',
    );
  }

  return {
    uploadDir,
    backupDir,
    projectRoot: PROJECT_ROOT,
  };
}

export function loadStorageConfig(
  options: LoadStorageConfigOptions = {},
): StorageConfig {
  const env = options.env ?? process.env;

  if (options.loadDotEnvFile !== false) {
    loadEnvFile(options.dotEnvPath ?? path.join(PROJECT_ROOT, '.env'), env);
  }

  return resolveStorageConfig(env);
}

export function isPathInsideProject(
  filePath: string,
  projectRoot: string = PROJECT_ROOT,
): boolean {
  const relative = path.relative(projectRoot, path.resolve(filePath));

  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function projectRelativePath(
  filePath: string,
  projectRoot: string = PROJECT_ROOT,
): string {
  const resolved = path.resolve(filePath);

  if (!isPathInsideProject(resolved, projectRoot)) {
    return path.basename(resolved);
  }

  return path.relative(projectRoot, resolved).split(path.sep).join('/');
}
