import {
  ROLES,
  type Role,
} from '../../../../shared/src/constants/enums.ts';
import { AppError } from '../../lib/errors.ts';
import { getPrisma } from '../../lib/prisma.ts';
import {
  writeAuditLog,
  type AuditRequestContext,
} from '../../services/audit.ts';
import { hashPassword } from '../auth/password.ts';

export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUserSource {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserActor {
  id: string;
  role: Role;
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName: string;
  role: Role;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: Role;
  isActive?: boolean;
}

function isPrismaErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export function normalizeRole(value: string): Role {
  return (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : 'VIEWER';
}

export function toPublicUser(user: PublicUserSource): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: normalizeRole(user.role),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await getPrisma().user.findMany({
    select: PUBLIC_USER_SELECT,
    orderBy: { username: 'asc' },
  });

  return users.map(toPublicUser);
}

export async function createUser(
  input: CreateUserInput,
  actor: UserActor,
  context: AuditRequestContext,
): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  let user: PublicUserSource;

  try {
    user = await getPrisma().user.create({
      data: {
        username: input.username,
        passwordHash,
        displayName: input.displayName,
        role: input.role,
      },
      select: PUBLIC_USER_SELECT,
    });
  } catch (error) {
    if (isPrismaErrorWithCode(error, 'P2002')) {
      throw new AppError('DUPLICATE', '用户名已存在。');
    }

    throw error;
  }

  const publicUser = toPublicUser(user);

  await writeAuditLog({
    action: 'USER_CREATE',
    actorId: actor.id,
    actorRole: actor.role,
    entityType: 'User',
    entityId: publicUser.id,
    after: publicUser,
    context,
  });

  return publicUser;
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actor: UserActor,
  context: AuditRequestContext,
): Promise<PublicUser> {
  const existing = await getPrisma().user.findUnique({
    where: { id: userId },
    select: PUBLIC_USER_SELECT,
  });

  if (existing === null) {
    throw new AppError('NOT_FOUND', '用户不存在。');
  }

  const existingRole = normalizeRole(existing.role);

  if (userId === actor.id) {
    if (input.role !== undefined && input.role !== existingRole) {
      throw new AppError('VALIDATION_ERROR', '不能修改自己的角色。');
    }

    if (input.isActive === false) {
      throw new AppError('VALIDATION_ERROR', '不能禁用当前登录账号。');
    }
  }

  const data: {
    displayName?: string;
    role?: string;
    isActive?: boolean;
  } = {};

  if (input.displayName !== undefined) {
    data.displayName = input.displayName;
  }

  if (input.role !== undefined) {
    data.role = input.role;
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  let updated: PublicUserSource;

  try {
    updated = await getPrisma().user.update({
      where: { id: userId },
      data,
      select: PUBLIC_USER_SELECT,
    });
  } catch (error) {
    if (isPrismaErrorWithCode(error, 'P2025')) {
      throw new AppError('NOT_FOUND', '用户不存在。');
    }

    throw error;
  }

  const publicBefore = toPublicUser(existing);
  const publicAfter = toPublicUser(updated);
  const action =
    input.isActive === false && existing.isActive
      ? 'USER_DISABLE'
      : 'USER_UPDATE';

  await writeAuditLog({
    action,
    actorId: actor.id,
    actorRole: actor.role,
    entityType: 'User',
    entityId: userId,
    before: publicBefore,
    after: publicAfter,
    context,
  });

  return publicAfter;
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
  actor: UserActor,
  context: AuditRequestContext,
): Promise<void> {
  const existing = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true },
  });

  if (existing === null) {
    throw new AppError('NOT_FOUND', '用户不存在。');
  }

  const passwordHash = await hashPassword(newPassword);

  await getPrisma().user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await writeAuditLog({
    action: 'USER_UPDATE',
    actorId: actor.id,
    actorRole: actor.role,
    entityType: 'User',
    entityId: userId,
    after: {
      username: existing.username,
      passwordReset: true,
    },
    reason: 'ADMIN_RESET_PASSWORD',
    context,
  });
}
