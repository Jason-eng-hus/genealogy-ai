import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPrisma } from '../src/lib/prisma.ts';
import { writeAuditLog } from '../src/services/audit.ts';
import type { AuthTestContext } from './support/auth-app.ts';
import {
  createAuthTestContext,
  seededUser,
} from './support/auth-app.ts';

interface TriggerRow {
  name: string;
}

describe('审计日志只追加', () => {
  let context: AuthTestContext;

  beforeEach(async () => {
    context = await createAuthTestContext({ label: 'audit-immutable' });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  async function writeLoginAudit(): Promise<string> {
    const admin = seededUser(context, 'ADMIN');

    await writeAuditLog({
      action: 'AUTH_LOGIN',
      actorId: admin.id,
      actorRole: 'ADMIN',
      entityType: 'User',
      entityId: admin.id,
      after: { username: admin.username },
      context: {
        ip: '127.0.0.1',
        userAgent: 'vitest',
        requestId: 'audit-immutable-test',
      },
    });

    const row = await getPrisma().auditLog.findFirst({
      where: { action: 'AUTH_LOGIN' },
      orderBy: { createdAt: 'desc' },
    });

    if (row === null) {
      throw new Error('Expected the audit row to exist.');
    }

    return row.id;
  }

  it('迁移创建了禁止更新与删除的触发器', async () => {
    const triggers = await getPrisma().$queryRaw<TriggerRow[]>`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger' AND tbl_name = 'AuditLog'
      ORDER BY name ASC
    `;

    expect(triggers.map((trigger) => trigger.name)).toEqual([
      'AuditLog_no_delete',
      'AuditLog_no_update',
    ]);
  });

  it('通过原生 SQLite 返回触发器不可变错误', async () => {
    const id = await writeLoginAudit();
    const database = new DatabaseSync(context.database.filePath);

    try {
      expect(() =>
        database
          .prepare('UPDATE "AuditLog" SET "reason" = ? WHERE "id" = ?')
          .run('tampered', id),
      ).toThrow(/AUDIT_LOG_IMMUTABLE/);
      expect(() =>
        database
          .prepare('DELETE FROM "AuditLog" WHERE "id" = ?')
          .run(id),
      ).toThrow(/AUDIT_LOG_IMMUTABLE/);
    } finally {
      database.close();
    }
  });

  it('拒绝更新审计记录并保留原值', async () => {
    const id = await writeLoginAudit();

    // Prisma 把 SQLite 触发器错误统一映射为约束错误，这里只断言操作被拒绝。
    await expect(
      getPrisma().auditLog.update({
        where: { id },
        data: { reason: 'tampered' },
      }),
    ).rejects.toThrow();

    const row = await getPrisma().auditLog.findUnique({ where: { id } });

    expect(row?.reason).toBeNull();
    expect(await getPrisma().auditLog.count()).toBe(1);
  });

  it('拒绝删除审计记录', async () => {
    const id = await writeLoginAudit();

    await expect(
      getPrisma().auditLog.delete({ where: { id } }),
    ).rejects.toThrow();

    expect(
      await getPrisma().auditLog.findUnique({ where: { id } }),
    ).not.toBeNull();
    expect(await getPrisma().auditLog.count()).toBe(1);
  });

  it('拒绝批量更新与批量删除', async () => {
    await writeLoginAudit();

    await expect(
      getPrisma().auditLog.updateMany({
        data: { actorRole: 'VIEWER' },
      }),
    ).rejects.toThrow();
    await expect(
      getPrisma().auditLog.deleteMany(),
    ).rejects.toThrow();
    expect(await getPrisma().auditLog.count()).toBe(1);
  });

  it('阻止篡改后仍可继续追加审计记录', async () => {
    const firstId = await writeLoginAudit();

    await expect(
      getPrisma().auditLog.update({
        where: { id: firstId },
        data: { reason: 'tampered' },
      }),
    ).rejects.toThrow();

    await writeLoginAudit();

    expect(await getPrisma().auditLog.count()).toBe(2);
  });
});
