import path from 'node:path';
import {
  loadEnvFile,
  PROJECT_ROOT,
  type AppEnv,
} from './env.ts';

export const JWT_SECRET_MIN_LENGTH = 32;
export const DEFAULT_JWT_EXPIRES_IN_SECONDS = 8 * 60 * 60;
export const MAX_JWT_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_SESSION_COOKIE_NAME = 'genealogy_session';
export const EXAMPLE_JWT_SECRET =
  'replace-with-at-least-32-random-characters';

export type AuthConfigErrorCode =
  | 'JWT_SECRET_MISSING'
  | 'JWT_SECRET_TOO_SHORT'
  | 'JWT_SECRET_PLACEHOLDER'
  | 'JWT_EXPIRES_IN_INVALID'
  | 'COOKIE_SECURE_INVALID'
  | 'COOKIE_SECURE_REQUIRED';

export class AuthConfigError extends Error {
  readonly code: AuthConfigErrorCode;

  constructor(
    code: AuthConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AuthConfigError';
    this.code = code;
  }
}

export interface AuthConfig {
  appEnv: AppEnv;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  cookieName: string;
  cookieSecure: boolean;
}

export interface LoadAuthConfigOptions {
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

function resolveJwtSecret(raw: string | undefined, appEnv: AppEnv): string {
  const secret = raw?.trim();

  if (!secret) {
    throw new AuthConfigError(
      'JWT_SECRET_MISSING',
      'JWT_SECRET is required.',
    );
  }

  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new AuthConfigError(
      'JWT_SECRET_TOO_SHORT',
      `JWT_SECRET must contain at least ${JWT_SECRET_MIN_LENGTH} characters.`,
    );
  }

  if (appEnv === 'production' && secret === EXAMPLE_JWT_SECRET) {
    throw new AuthConfigError(
      'JWT_SECRET_PLACEHOLDER',
      'JWT_SECRET must not use the example value in production.',
    );
  }

  return secret;
}

function resolveJwtExpiresInSeconds(raw: string | undefined): number {
  const value = raw?.trim();

  if (!value) {
    return DEFAULT_JWT_EXPIRES_IN_SECONDS;
  }

  const match = /^(\d+)\s*([smhd])?$/i.exec(value);

  if (match === null) {
    throw new AuthConfigError(
      'JWT_EXPIRES_IN_INVALID',
      'JWT_EXPIRES_IN must be a duration such as 30m, 8h, or 7d.',
    );
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };
  const seconds = amount * multipliers[unit];

  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 60 ||
    seconds > MAX_JWT_EXPIRES_IN_SECONDS
  ) {
    throw new AuthConfigError(
      'JWT_EXPIRES_IN_INVALID',
      `JWT_EXPIRES_IN must be between 60 seconds and ${MAX_JWT_EXPIRES_IN_SECONDS} seconds.`,
    );
  }

  return seconds;
}

function resolveCookieSecure(
  raw: string | undefined,
  appEnv: AppEnv,
): boolean {
  const value = raw?.trim().toLowerCase();

  if (!value || value === 'false') {
    if (appEnv === 'production') {
      throw new AuthConfigError(
        'COOKIE_SECURE_REQUIRED',
        'COOKIE_SECURE must be true in production.',
      );
    }

    return false;
  }

  if (value === 'true') {
    return true;
  }

  throw new AuthConfigError(
    'COOKIE_SECURE_INVALID',
    'COOKIE_SECURE must be "true" or "false".',
  );
}

export function resolveAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const appEnv = readAppEnv(env);

  return {
    appEnv,
    jwtSecret: resolveJwtSecret(env.JWT_SECRET, appEnv),
    jwtExpiresInSeconds: resolveJwtExpiresInSeconds(env.JWT_EXPIRES_IN),
    cookieName: DEFAULT_SESSION_COOKIE_NAME,
    cookieSecure: resolveCookieSecure(env.COOKIE_SECURE, appEnv),
  };
}

export function loadAuthConfig(
  options: LoadAuthConfigOptions = {},
): AuthConfig {
  const env = options.env ?? process.env;

  if (options.loadDotEnvFile !== false) {
    loadEnvFile(options.dotEnvPath ?? path.join(PROJECT_ROOT, '.env'), env);
  }

  return resolveAuthConfig(env);
}
