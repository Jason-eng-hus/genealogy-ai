import type { Request, Response } from 'express';
import { getRequestId } from '../lib/http.ts';
import { getPrisma } from '../lib/prisma.ts';

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DISABLE';

export interface AuditRequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface WriteAuditLogInput {
  action: AuditAction;
  actorId?: string | null;
  actorRole: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  context: AuditRequestContext;
}

function truncate(value: string | null, maxLength: number): string | null {
  if (value === null) {
    return null;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function createAuditRequestContext(
  req: Request,
  res: Response,
): AuditRequestContext {
  const userAgent = req.get('user-agent') ?? null;
  const requestId = getRequestId(res);

  return {
    ip: truncate(req.ip ?? req.socket.remoteAddress ?? null, 64),
    userAgent: truncate(userAgent, 512),
    requestId: requestId === '' ? null : requestId,
  };
}

function serializeSnapshot(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  const serialized = JSON.stringify(value);

  return serialized === undefined ? null : serialized;
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  await getPrisma().auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      beforeJson: serializeSnapshot(input.before),
      afterJson: serializeSnapshot(input.after),
      reason: input.reason ?? null,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      requestId: input.context.requestId,
    },
  });
}
