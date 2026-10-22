import type { AuthConfig } from '../../config/auth.ts';
import { AppError } from '../../lib/errors.ts';
import { getPrisma } from '../../lib/prisma.ts';
import {
  writeAuditLog,
  type AuditRequestContext,
} from '../../services/audit.ts';
import {
  normalizeRole,
  PUBLIC_USER_SELECT,
  toPublicUser,
  type PublicUser,
  type UserActor,
} from '../users/service.ts';
import {
  fingerprintsMatch,
  hashPassword,
  passwordFingerprint,
  performDummyPasswordCheck,
  verifyPassword,
} from './password.ts';
import { signAuthToken } from './token.ts';

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  user: PublicUser;
  token: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

const INVALID_CREDENTIALS_MESSAGE = '用户名或密码错误。';

export async function login(
  input: LoginInput,
  authConfig: AuthConfig,
  context: AuditRequestContext,
): Promise<LoginResult> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (user === null) {
    await performDummyPasswordCheck(input.password);
    await writeAuditLog({
      action: 'AUTH_LOGIN_FAILED',
      actorId: null,
      actorRole: 'ANONYMOUS',
      after: { username: input.username },
      reason: 'INVALID_CREDENTIALS',
      context,
    });

    throw new AppError('AUTH_REQUIRED', INVALID_CREDENTIALS_MESSAGE);
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (!user.isActive || !passwordMatches) {
    await writeAuditLog({
      action: 'AUTH_LOGIN_FAILED',
      actorId: user.id,
      actorRole: normalizeRole(user.role),
      entityType: 'User',
      entityId: user.id,
      after: { username: user.username },
      reason: user.isActive ? 'INVALID_CREDENTIALS' : 'ACCOUNT_DISABLED',
      context,
    });

    throw new AppError('AUTH_REQUIRED', INVALID_CREDENTIALS_MESSAGE);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: PUBLIC_USER_SELECT,
  });
  const publicUser = toPublicUser(updated);
  const token = signAuthToken(
    {
      sub: publicUser.id,
      role: publicUser.role,
      pwv: passwordFingerprint(
        authConfig.jwtSecret,
        user.passwordHash,
      ),
    },
    {
      secret: authConfig.jwtSecret,
      expiresInSeconds: authConfig.jwtExpiresInSeconds,
    },
  );

  await writeAuditLog({
    action: 'AUTH_LOGIN',
    actorId: publicUser.id,
    actorRole: publicUser.role,
    entityType: 'User',
    entityId: publicUser.id,
    after: { username: publicUser.username },
    context,
  });

  return { user: publicUser, token };
}

export async function logout(
  actor: UserActor,
  context: AuditRequestContext,
): Promise<void> {
  await writeAuditLog({
    action: 'AUTH_LOGOUT',
    actorId: actor.id,
    actorRole: actor.role,
    entityType: 'User',
    entityId: actor.id,
    context,
  });
}

export async function changeOwnPassword(
  userId: string,
  input: ChangePasswordInput,
  context: AuditRequestContext,
): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (user === null || !user.isActive) {
    throw new AppError('AUTH_REQUIRED', '请先登录。');
  }

  const currentMatches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!currentMatches) {
    throw new AppError('VALIDATION_ERROR', '当前密码不正确。', {
      details: {
        issues: [
          {
            path: 'currentPassword',
            message: '当前密码不正确。',
            code: 'custom',
          },
        ],
      },
    });
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await writeAuditLog({
    action: 'USER_UPDATE',
    actorId: user.id,
    actorRole: normalizeRole(user.role),
    entityType: 'User',
    entityId: user.id,
    after: { passwordChanged: true },
    context,
  });
}

export function verifyPasswordFingerprint(
  authConfig: AuthConfig,
  passwordHash: string,
  fingerprint: string,
): boolean {
  return fingerprintsMatch(
    passwordFingerprint(authConfig.jwtSecret, passwordHash),
    fingerprint,
  );
}
