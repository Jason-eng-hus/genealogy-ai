export const AUDIT_ACTIONS = [
  'AUTH_LOGIN',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DISABLE',
  'PERSON_CREATE',
  'PERSON_UPDATE',
  'PERSON_DELETE',
  'PERSON_STATUS_CHANGE',
  'RELATION_CREATE',
  'RELATION_UPDATE',
  'RELATION_DELETE',
  'EVENT_CREATE',
  'EVENT_UPDATE',
  'EVENT_DELETE',
  'SOURCE_CREATE',
  'SOURCE_UPDATE',
  'CITATION_CREATE',
  'CITATION_DELETE',
  'AI_JOB_START',
  'AI_DRAFT_ACCEPT',
  'AI_DRAFT_REJECT',
  'NARRATIVE_CREATE',
  'NARRATIVE_CONFIRM',
  'NARRATIVE_EXPORT',
  'CHECK_RUN',
  'ISSUE_IGNORE',
  'ISSUE_RESOLVE',
  'REVIEW_SUBMIT',
  'REVIEW_APPROVE',
  'REVIEW_REJECT',
  'REVIEW_CANCEL',
  'MERGE_EXECUTE',
  'GEDCOM_IMPORT_COMMIT',
  'GEDCOM_EXPORT',
  'TREE_EXPORT',
  'BACKUP_CREATE',
  'PRIVACY_ACK',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  AUTH_LOGIN: '登录成功',
  AUTH_LOGIN_FAILED: '登录失败',
  AUTH_LOGOUT: '退出登录',
  USER_CREATE: '创建用户',
  USER_UPDATE: '更新用户',
  USER_DISABLE: '停用用户',
  PERSON_CREATE: '创建人物',
  PERSON_UPDATE: '更新人物',
  PERSON_DELETE: '删除人物',
  PERSON_STATUS_CHANGE: '人物状态变更',
  RELATION_CREATE: '创建关系',
  RELATION_UPDATE: '更新关系',
  RELATION_DELETE: '删除关系',
  EVENT_CREATE: '创建事件',
  EVENT_UPDATE: '更新事件',
  EVENT_DELETE: '删除事件',
  SOURCE_CREATE: '创建来源',
  SOURCE_UPDATE: '更新来源',
  CITATION_CREATE: '创建引用',
  CITATION_DELETE: '删除引用',
  AI_JOB_START: '启动 AI 任务',
  AI_DRAFT_ACCEPT: '接受 AI 草稿',
  AI_DRAFT_REJECT: '拒绝 AI 草稿',
  NARRATIVE_CREATE: '创建叙事',
  NARRATIVE_CONFIRM: '确认叙事',
  NARRATIVE_EXPORT: '导出叙事',
  CHECK_RUN: '运行一致性检查',
  ISSUE_IGNORE: '忽略校验问题',
  ISSUE_RESOLVE: '解决校验问题',
  REVIEW_SUBMIT: '提交审核',
  REVIEW_APPROVE: '批准审核',
  REVIEW_REJECT: '驳回审核',
  REVIEW_CANCEL: '撤回审核',
  MERGE_EXECUTE: '执行合并',
  GEDCOM_IMPORT_COMMIT: '提交 GEDCOM 导入',
  GEDCOM_EXPORT: '导出 GEDCOM',
  TREE_EXPORT: '导出家谱树',
  BACKUP_CREATE: '创建备份',
  PRIVACY_ACK: '确认隐私遮罩',
};

export const AUDIT_ENTITY_TYPES = [
  'User',
  'Person',
  'Relation',
  'Event',
  'Source',
  'Citation',
  'AiJob',
  'AiDraft',
  'Narrative',
  'ConsistencyIssue',
  'ReviewRequest',
  'GedcomImport',
  'Family',
  'Backup',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  User: '用户',
  Person: '人物',
  Relation: '关系',
  Event: '事件',
  Source: '来源',
  Citation: '引用',
  AiJob: 'AI 任务',
  AiDraft: 'AI 草稿',
  Narrative: '叙事',
  ConsistencyIssue: '校验问题',
  ReviewRequest: '审核请求',
  GedcomImport: 'GEDCOM 导入',
  Family: '家族',
  Backup: '备份',
};

export const AUDIT_FAILURE_ACTIONS: readonly AuditAction[] = [
  'AUTH_LOGIN_FAILED',
];

export const AUDIT_ANONYMOUS_ACTOR_LABEL = '匿名';

export const AUDIT_PAGE_SIZE_DEFAULT = 20;
export const AUDIT_PAGE_SIZE_MAX = 100;
export const AUDIT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function auditActionLabel(action: string): string {
  return (
    AUDIT_ACTION_LABELS[action as AuditAction] ?? action
  );
}

export function auditEntityLabel(entityType: string | null): string {
  if (entityType === null) {
    return '—';
  }

  return (
    AUDIT_ENTITY_LABELS[entityType as AuditEntityType] ?? entityType
  );
}
