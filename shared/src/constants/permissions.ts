import type { Role } from './enums.ts';

export const ROLE_LABELS = {
  ADMIN: '管理员',
  EDITOR: '编辑员',
  REVIEWER: '审核员',
  VIEWER: '访客',
} as const satisfies Record<Role, string>;

export const PERMISSIONS = [
  'DASHBOARD_VIEW',
  'DATA_READ',
  'PRIVACY_FULL_VIEW',
  'KINSHIP_READ',
  'PERSON_WRITE',
  'RELATION_WRITE',
  'EVENT_WRITE',
  'SOURCE_WRITE',
  'SOURCE_FILE_READ',
  'AI_DRAFT_REVIEW',
  'CHECK_RUN',
  'CHECK_VIEW',
  'NARRATIVE_GENERATE',
  'NARRATIVE_READ',
  'REVIEW_SUBMIT',
  'REVIEW_DECIDE',
  'GEDCOM_IMPORT',
  'EXPORT',
  'USER_MANAGE',
  'AUDIT_VIEW',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS = {
  ADMIN: [
    'DASHBOARD_VIEW',
    'DATA_READ',
    'PRIVACY_FULL_VIEW',
    'KINSHIP_READ',
    'PERSON_WRITE',
    'RELATION_WRITE',
    'EVENT_WRITE',
    'SOURCE_WRITE',
    'SOURCE_FILE_READ',
    'AI_DRAFT_REVIEW',
    'CHECK_RUN',
    'CHECK_VIEW',
    'NARRATIVE_GENERATE',
    'NARRATIVE_READ',
    'REVIEW_SUBMIT',
    'REVIEW_DECIDE',
    'GEDCOM_IMPORT',
    'EXPORT',
    'USER_MANAGE',
    'AUDIT_VIEW',
  ],
  EDITOR: [
    'DASHBOARD_VIEW',
    'DATA_READ',
    'PRIVACY_FULL_VIEW',
    'KINSHIP_READ',
    'PERSON_WRITE',
    'RELATION_WRITE',
    'EVENT_WRITE',
    'SOURCE_WRITE',
    'SOURCE_FILE_READ',
    'AI_DRAFT_REVIEW',
    'CHECK_RUN',
    'CHECK_VIEW',
    'NARRATIVE_GENERATE',
    'NARRATIVE_READ',
    'REVIEW_SUBMIT',
    'GEDCOM_IMPORT',
    'EXPORT',
  ],
  REVIEWER: [
    'DASHBOARD_VIEW',
    'DATA_READ',
    'PRIVACY_FULL_VIEW',
    'KINSHIP_READ',
    'SOURCE_FILE_READ',
    'CHECK_RUN',
    'CHECK_VIEW',
    'NARRATIVE_READ',
    'REVIEW_DECIDE',
    'EXPORT',
    'AUDIT_VIEW',
  ],
  VIEWER: [
    'DASHBOARD_VIEW',
    'DATA_READ',
    'KINSHIP_READ',
  ],
} as const satisfies Record<Role, readonly Permission[]>;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission);
}
