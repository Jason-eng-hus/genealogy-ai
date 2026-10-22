import path from 'node:path';
import {
  loadEnvFile,
  PROJECT_ROOT,
  type AppEnv,
} from './env.ts';

export const DEFAULT_DEV_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const;

export type SecurityConfigErrorCode = 'ALLOWED_ORIGINS_INVALID';

export class SecurityConfigError extends Error {
  readonly code: SecurityConfigErrorCode;

  constructor(
    code: SecurityConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SecurityConfigError';
    this.code = code;
  }
}

export interface SecurityConfig {
  appEnv: AppEnv;
  allowedOrigins: readonly string[];
}

export interface LoadSecurityConfigOptions {
  dotEnvPath?: string;
  env?: NodeJS.ProcessEnv;
  loadDotEnvFile?: boolean;
}

function readAppEnv(env: NodeJS.ProcessEnv): AppEnv {
  const value = env.NODE_ENV?.trim();

  if (
    value === 'development' ||
    value === 'test' ||
    value === 'production'
  ) {
    return value;
  }

  return 'development';
}

function parseOrigin(entry: string): string {
  if (entry === '*') {
    throw new SecurityConfigError(
      'ALLOWED_ORIGINS_INVALID',
      'ALLOWED_ORIGINS must list explicit origins, not "*".',
    );
  }

  let url: URL;

  try {
    url = new URL(entry);
  } catch {
    throw new SecurityConfigError(
      'ALLOWED_ORIGINS_INVALID',
      `ALLOWED_ORIGINS contains an invalid origin: ${entry}`,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SecurityConfigError(
      'ALLOWED_ORIGINS_INVALID',
      `ALLOWED_ORIGINS only supports http and https origins: ${entry}`,
    );
  }

  if (url.username !== '' || url.password !== '') {
    throw new SecurityConfigError(
      'ALLOWED_ORIGINS_INVALID',
      `ALLOWED_ORIGINS must not contain credentials: ${entry}`,
    );
  }

  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new SecurityConfigError(
      'ALLOWED_ORIGINS_INVALID',
      `ALLOWED_ORIGINS must contain origins without paths, queries, or fragments: ${entry}`,
    );
  }

  return url.origin;
}

function resolveAllowedOrigins(
  raw: string | undefined,
  appEnv: AppEnv,
): string[] {
  const value = raw?.trim();

  if (!value) {
    return appEnv === 'production'
      ? []
      : [...DEFAULT_DEV_ALLOWED_ORIGINS];
  }

  const origins = new Set<string>();

  for (const part of value.split(',')) {
    const entry = part.trim();

    if (entry === '') {
      throw new SecurityConfigError(
        'ALLOWED_ORIGINS_INVALID',
        'ALLOWED_ORIGINS contains an empty entry.',
      );
    }

    origins.add(parseOrigin(entry));
  }

  return [...origins];
}

export function resolveSecurityConfig(
  env: NodeJS.ProcessEnv = process.env,
): SecurityConfig {
  const appEnv = readAppEnv(env);

  return {
    appEnv,
    allowedOrigins: resolveAllowedOrigins(env.ALLOWED_ORIGINS, appEnv),
  };
}

export function loadSecurityConfig(
  options: LoadSecurityConfigOptions = {},
): SecurityConfig {
  const env = options.env ?? process.env;

  if (options.loadDotEnvFile !== false) {
    loadEnvFile(options.dotEnvPath ?? path.join(PROJECT_ROOT, '.env'), env);
  }

  return resolveSecurityConfig(env);
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(
  origin: string | undefined,
  config: SecurityConfig,
  requestOrigin: string | null,
): boolean {
  if (origin === undefined || origin === null || origin === 'null') {
    return false;
  }

  const normalized = normalizeOrigin(origin);

  if (normalized === null) {
    return false;
  }

  if (requestOrigin !== null && normalized === requestOrigin) {
    return true;
  }

  return config.allowedOrigins.includes(normalized);
}
