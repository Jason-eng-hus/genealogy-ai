import type {
  AuditLogPage,
  AuditLogQuery,
} from '@shared/types/audit.ts';
import { request } from './client';

export async function fetchAuditLogs(
  query: AuditLogQuery = {},
): Promise<AuditLogPage> {
  const params: Record<string, string | number> = {};

  if (query.action !== undefined) {
    params.action = query.action;
  }

  if (query.entityType !== undefined) {
    params.entityType = query.entityType;
  }

  if (query.entityId !== undefined) {
    params.entityId = query.entityId;
  }

  if (query.actor !== undefined) {
    params.actor = query.actor;
  }

  if (query.from !== undefined) {
    params.from = query.from;
  }

  if (query.to !== undefined) {
    params.to = query.to;
  }

  params.page = query.page ?? 1;
  params.pageSize = query.pageSize ?? 20;

  return request<AuditLogPage>({
    url: '/audit-logs',
    method: 'GET',
    params,
  });
}
