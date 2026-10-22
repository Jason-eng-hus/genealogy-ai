import type { Prisma } from '@prisma/client';
import type {
  AuditAction,
  AuditEntityType,
} from '../../../../shared/src/constants/audit.ts';
import type {
  AuditLogItem,
  AuditLogPage,
} from '../../../../shared/src/types/audit.ts';
import { getPrisma } from '../../lib/prisma.ts';
import { diffSnapshots, redactSnapshot } from './diff.ts';
import type { AuditLogQueryInput } from './schemas.ts';

const AUDIT_ROW_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  actorRole: true,
  entityType: true,
  entityId: true,
  reason: true,
  requestId: true,
  beforeJson: true,
  afterJson: true,
  actor: {
    select: {
      id: true,
      username: true,
      displayName: true,
    },
  },
} as const;

type AuditRow = Prisma.AuditLogGetPayload<{
  select: typeof AUDIT_ROW_SELECT;
}>;

function parseSnapshot(json: string | null): unknown {
  if (json === null) {
    return null;
  }

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function toAuditLogItem(row: AuditRow): AuditLogItem {
  const before = redactSnapshot(parseSnapshot(row.beforeJson));
  const after = redactSnapshot(parseSnapshot(row.afterJson));

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action as AuditAction,
    actorRole: row.actorRole,
    actor: row.actor,
    entityType: row.entityType as AuditEntityType | null,
    entityId: row.entityId,
    reason: row.reason,
    requestId: row.requestId,
    before: before.value,
    after: after.value,
    changes: diffSnapshots(before.value, after.value),
    redacted: before.redacted || after.redacted,
  };
}

function buildWhere(
  query: AuditLogQueryInput,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (query.action !== undefined) {
    where.action = query.action;
  }

  if (query.entityType !== undefined) {
    where.entityType = query.entityType;
  }

  if (query.entityId !== undefined) {
    where.entityId = query.entityId;
  }

  if (query.actor !== undefined) {
    where.actor = {
      is: {
        OR: [
          { username: { contains: query.actor } },
          { displayName: { contains: query.actor } },
        ],
      },
    };
  }

  if (query.from !== undefined || query.to !== undefined) {
    where.createdAt = {
      ...(query.from === undefined ? {} : { gte: query.from }),
      ...(query.to === undefined ? {} : { lte: query.to }),
    };
  }

  return where;
}

export async function listAuditLogs(
  query: AuditLogQueryInput,
): Promise<AuditLogPage> {
  const prisma = getPrisma();
  const where = buildWhere(query);

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: AUDIT_ROW_SELECT,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map(toAuditLogItem),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
