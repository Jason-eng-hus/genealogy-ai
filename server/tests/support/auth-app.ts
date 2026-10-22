import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '../../../shared/src/constants/enums.ts';
import { createApp } from '../../src/app.ts';
import {
  resolveAuthConfig,
  type AuthConfig,
} from '../../src/config/auth.ts';
import {
  resolveAppConfig,
  type AppConfig,
} from '../../src/config/env.ts';
import {
  resolveSecurityConfig,
  type SecurityConfig,
} from '../../src/config/security.ts';
import { createLogger } from '../../src/lib/logger.ts';
import {
  closeDatabase,
  getPrisma,
  initializeDatabase,
} from '../../src/lib/prisma.ts';
import { hashPassword } from '../../src/modules/auth/password.ts';
import {
  createLoginRateLimiter,
  type LoginRateLimiter,
  type LoginRateLimitOptions,
} from '../../src/modules/auth/rate-limit.ts';
import {
  createTempDatabase,
  type TempDatabase,
} from './temp-database.ts';

export const TEST_PASSWORD = 'Passw0rd!23';
export const TEST_JWT_SECRET = 'test-auth-secret-0123456789abcdef';
export const TEST_ORIGIN = 'http://127.0.0.1:5173';
export const AJAX_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Origin: TEST_ORIGIN,
};

const SEEDED_ACCOUNTS: Array<{
  role: Role;
  username: string;
  displayName: string;
}> = [
  { role: 'ADMIN', username: 'admin', displayName: '管理员' },
  { role: 'EDITOR', username: 'editor', displayName: '编辑员' },
  { role: 'REVIEWER', username: 'reviewer', displayName: '审核员' },
  { role: 'VIEWER', username: 'viewer', displayName: '访客' },
];

export interface SeededUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  password: string;
}

export interface AuthTestContext {
  app: Express;
  config: AppConfig;
  authConfig: AuthConfig;
  security: SecurityConfig;
  rateLimiter: LoginRateLimiter;
  users: SeededUser[];
  database: TempDatabase;
  cleanup: () => Promise<void>;
}

export interface CreateAuthTestContextOptions {
  label: string;
  rateLimit?: LoginRateLimitOptions;
}

export function seededUser(
  context: AuthTestContext,
  role: Role,
): SeededUser {
  const user = context.users.find((candidate) => candidate.role === role);

  if (user === undefined) {
    throw new Error(`Missing seeded user for role ${role}.`);
  }

  return user;
}

export async function createAuthTestContext(
  options: CreateAuthTestContextOptions,
): Promise<AuthTestContext> {
  const database = createTempDatabase(options.label);
  const config = resolveAppConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: database.url,
  });
  const authConfig = resolveAuthConfig({
    NODE_ENV: 'test',
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_EXPIRES_IN: '1h',
    COOKIE_SECURE: 'false',
  });
  const security = resolveSecurityConfig({
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: TEST_ORIGIN,
  });
  const logger = createLogger({ level: 'silent', appEnv: 'test' });

  try {
    await initializeDatabase({ config: config.database });

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const users: SeededUser[] = [];

    for (const account of SEEDED_ACCOUNTS) {
      const user = await getPrisma().user.create({
        data: {
          username: account.username,
          displayName: account.displayName,
          role: account.role,
          passwordHash,
        },
      });

      users.push({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: account.role,
        password: TEST_PASSWORD,
      });
    }

    const rateLimiter = createLoginRateLimiter(options.rateLimit);
    const app = createApp({
      config,
      auth: authConfig,
      security,
      logger,
      loginRateLimiter: rateLimiter,
    });

    return {
      app,
      config,
      authConfig,
      security,
      rateLimiter,
      users,
      database,
      cleanup: async () => {
        await closeDatabase();
        database.cleanup();
      },
    };
  } catch (error) {
    await closeDatabase().catch(() => undefined);
    database.cleanup();
    throw error;
  }
}

export async function loginAs(
  app: Express,
  username: string,
  password: string = TEST_PASSWORD,
) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/login')
    .set(AJAX_HEADERS)
    .send({ username, password });

  return { agent, response };
}
