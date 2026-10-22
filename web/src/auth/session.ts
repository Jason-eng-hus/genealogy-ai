import { CLIENT_ERROR_CODES, ApiError, request } from '@/api/client';
import { isRecord } from '@/api/types';
import { ROLES, type Role } from '@shared/constants/enums.ts';

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
}

function malformedUserError(): ApiError {
  return new ApiError(
    CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
    '服务端返回了无法识别的用户信息。',
  );
}

function parseSessionUser(value: unknown): SessionUser {
  if (!isRecord(value)) {
    throw malformedUserError();
  }

  const { id, username, displayName, role, isActive } = value;

  if (
    typeof id !== 'string' ||
    id === '' ||
    typeof username !== 'string' ||
    username === '' ||
    typeof displayName !== 'string' ||
    displayName === '' ||
    typeof role !== 'string' ||
    !(ROLES as readonly string[]).includes(role) ||
    typeof isActive !== 'boolean'
  ) {
    throw malformedUserError();
  }

  return {
    id,
    username,
    displayName,
    role: role as Role,
    isActive,
  };
}

function readSessionUser(payload: unknown): SessionUser {
  if (!isRecord(payload)) {
    throw malformedUserError();
  }

  return parseSessionUser(payload.user);
}

export async function fetchCurrentUser(): Promise<SessionUser> {
  const payload = await request<unknown>({
    url: '/auth/me',
    method: 'GET',
  });

  return readSessionUser(payload);
}

export async function login(
  username: string,
  password: string,
): Promise<SessionUser> {
  const payload = await request<unknown>({
    url: '/auth/login',
    method: 'POST',
    data: { username, password },
  });

  return readSessionUser(payload);
}

export async function logout(): Promise<void> {
  await request<null>({
    url: '/auth/logout',
    method: 'POST',
  });
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
