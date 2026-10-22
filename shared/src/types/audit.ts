import type {
  AuditAction,
  AuditEntityType,
} from '../constants/audit.ts';

export interface AuditLogQuery {
  action?: AuditAction;
  entityType?: AuditEntityType;
  entityId?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditActorSummary {
  id: string;
  username: string;
  displayName: string;
}

export type AuditChangeKind = 'ADDED' | 'REMOVED' | 'CHANGED';

export interface AuditChange {
  path: string;
  kind: AuditChangeKind;
  before: unknown;
  after: unknown;
}

export interface AuditLogItem {
  id: string;
  createdAt: string;
  action: AuditAction;
  actorRole: string;
  actor: AuditActorSummary | null;
  entityType: AuditEntityType | null;
  entityId: string | null;
  reason: string | null;
  requestId: string | null;
  before: unknown;
  after: unknown;
  changes: AuditChange[];
  redacted: boolean;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}
