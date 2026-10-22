import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/constants/enums.ts';
import {
  hasPermission,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Permission,
} from '../src/constants/permissions.ts';

const ALL_ROLES = ROLES;

describe('角色权限矩阵', () => {
  it('每个角色都有仪表盘、数据读取与亲缘查询权限', () => {
    for (const role of ALL_ROLES) {
      expect(hasPermission(role, 'DASHBOARD_VIEW')).toBe(true);
      expect(hasPermission(role, 'DATA_READ')).toBe(true);
      expect(hasPermission(role, 'KINSHIP_READ')).toBe(true);
    }
  });

  it('VIEWER 只有只读基础权限', () => {
    expect([...ROLE_PERMISSIONS.VIEWER].sort()).toEqual(
      ['DASHBOARD_VIEW', 'DATA_READ', 'KINSHIP_READ'].sort(),
    );
    expect(hasPermission('VIEWER', 'PRIVACY_FULL_VIEW')).toBe(false);
    expect(hasPermission('VIEWER', 'PERSON_WRITE')).toBe(false);
    expect(hasPermission('VIEWER', 'CHECK_VIEW')).toBe(false);
    expect(hasPermission('VIEWER', 'EXPORT')).toBe(false);
    expect(hasPermission('VIEWER', 'AUDIT_VIEW')).toBe(false);
  });

  it('ADMIN 拥有全部权限', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission('ADMIN', permission)).toBe(true);
    }
  });

  it('EDITOR 可编辑与提交审核，但不能审批、管理用户或查看审计', () => {
    for (const permission of [
      'PRIVACY_FULL_VIEW',
      'PERSON_WRITE',
      'RELATION_WRITE',
      'EVENT_WRITE',
      'SOURCE_WRITE',
      'SOURCE_FILE_READ',
      'AI_DRAFT_REVIEW',
      'NARRATIVE_GENERATE',
      'REVIEW_SUBMIT',
      'GEDCOM_IMPORT',
      'EXPORT',
    ] as const) {
      expect(hasPermission('EDITOR', permission)).toBe(true);
    }

    for (const permission of [
      'REVIEW_DECIDE',
      'USER_MANAGE',
      'AUDIT_VIEW',
    ] as const) {
      expect(hasPermission('EDITOR', permission)).toBe(false);
    }
  });

  it('REVIEWER 可审核、运行校验与导出，但不能编辑或生成叙事', () => {
    for (const permission of [
      'PRIVACY_FULL_VIEW',
      'SOURCE_FILE_READ',
      'CHECK_RUN',
      'CHECK_VIEW',
      'NARRATIVE_READ',
      'REVIEW_DECIDE',
      'EXPORT',
      'AUDIT_VIEW',
    ] as const) {
      expect(hasPermission('REVIEWER', permission)).toBe(true);
    }

    for (const permission of [
      'PERSON_WRITE',
      'RELATION_WRITE',
      'EVENT_WRITE',
      'SOURCE_WRITE',
      'AI_DRAFT_REVIEW',
      'NARRATIVE_GENERATE',
      'REVIEW_SUBMIT',
      'GEDCOM_IMPORT',
      'USER_MANAGE',
    ] as const) {
      expect(hasPermission('REVIEWER', permission)).toBe(false);
    }
  });

  it('只有 ADMIN 可以管理用户', () => {
    expect(hasPermission('ADMIN', 'USER_MANAGE')).toBe(true);

    for (const role of ['EDITOR', 'REVIEWER', 'VIEWER'] as const) {
      expect(hasPermission(role, 'USER_MANAGE')).toBe(false);
    }
  });

  it('只有 ADMIN 与 REVIEWER 可以查看审计', () => {
    expect(hasPermission('ADMIN', 'AUDIT_VIEW')).toBe(true);
    expect(hasPermission('REVIEWER', 'AUDIT_VIEW')).toBe(true);
    expect(hasPermission('EDITOR', 'AUDIT_VIEW')).toBe(false);
    expect(hasPermission('VIEWER', 'AUDIT_VIEW')).toBe(false);
  });

  it('权限清单无重复且每个角色的权限均来自清单', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);

    for (const role of ALL_ROLES) {
      const permissions = ROLE_PERMISSIONS[role] as readonly Permission[];

      expect(new Set(permissions).size).toBe(permissions.length);

      for (const permission of permissions) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it('非授权角色查询返回 false', () => {
    for (const role of ALL_ROLES) {
      expect(hasPermission(role, 'NOT_A_PERMISSION' as Permission)).toBe(false);
    }
  });

  it('矩阵覆盖全部四角色', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [...ROLES].sort(),
    );
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
