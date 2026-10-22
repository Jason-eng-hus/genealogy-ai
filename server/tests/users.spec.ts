import type { Response } from 'supertest';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { getPrisma } from '../src/lib/prisma.ts';
import { verifyPassword } from '../src/modules/auth/password.ts';
import type { AuthTestContext, SeededUser } from './support/auth-app.ts';
import {
  AJAX_HEADERS,
  createAuthTestContext,
  loginAs,
  seededUser,
  TEST_PASSWORD,
} from './support/auth-app.ts';

let sequence = 0;

function uniqueUsername(prefix: string): string {
  sequence += 1;

  return `${prefix}.${sequence}`;
}

function sessionCookie(response: Response): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : [header];
  const cookie = values.find(
    (value): value is string =>
      typeof value === 'string' && value.startsWith('genealogy_session='),
  );

  if (cookie === undefined) {
    throw new Error('Session cookie is missing from the response.');
  }

  return cookie.split(';')[0];
}

async function latestAuditFor(
  action: string,
  entityId: string,
) {
  return getPrisma().auditLog.findFirst({
    where: { action, entityId },
    orderBy: { createdAt: 'desc' },
  });
}

describe('用户管理', () => {
  let context: AuthTestContext;
  let admin: SeededUser;
  let adminAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    context = await createAuthTestContext({ label: 'users' });
    admin = seededUser(context, 'ADMIN');
    adminAgent = (await loginAs(context.app, admin.username)).agent;
  });

  afterAll(async () => {
    await context.cleanup();
  });

  async function createUser(overrides: Record<string, unknown> = {}) {
    const username = uniqueUsername('created.user');
    const response = await adminAgent
      .post('/api/v1/users')
      .set(AJAX_HEADERS)
      .send({
        username,
        password: 'NewPassw0rd!1',
        displayName: '新建用户',
        role: 'EDITOR',
        ...overrides,
      });

    return { username, response };
  }

  it('管理员可以列出用户且响应不含密码哈希', async () => {
    const response = await adminAgent.get('/api/v1/users');

    expect(response.status).toBe(200);
    expect(response.body.code).toBe('OK');
    expect(response.body.data.items).toHaveLength(4);
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'admin', role: 'ADMIN' }),
        expect.objectContaining({ username: 'editor', role: 'EDITOR' }),
        expect.objectContaining({ username: 'reviewer', role: 'REVIEWER' }),
        expect.objectContaining({ username: 'viewer', role: 'VIEWER' }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('非管理员访问用户管理返回 403', async () => {
    const editor = seededUser(context, 'EDITOR');
    const editorAgent = (await loginAs(context.app, editor.username)).agent;
    const list = await editorAgent.get('/api/v1/users');
    const create = await editorAgent
      .post('/api/v1/users')
      .set(AJAX_HEADERS)
      .send({
        username: uniqueUsername('forbidden.user'),
        password: 'NewPassw0rd!1',
        displayName: '无权用户',
        role: 'VIEWER',
      });

    expect(list.status).toBe(403);
    expect(list.body.code).toBe('FORBIDDEN');
    expect(create.status).toBe(403);
    expect(create.body.code).toBe('FORBIDDEN');
  });

  it('管理员创建用户后可用新账号登录', async () => {
    const username = uniqueUsername('created.user');
    const response = await adminAgent
      .post('/api/v1/users')
      .set(AJAX_HEADERS)
      .send({
        username,
        password: 'NewPassw0rd!1',
        displayName: '新建编辑',
        role: 'EDITOR',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      username,
      displayName: '新建编辑',
      role: 'EDITOR',
      isActive: true,
    });
    expect(response.body.data).not.toHaveProperty('passwordHash');

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username, password: 'NewPassw0rd!1' });

    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('EDITOR');

    const record = await getPrisma().user.findUnique({
      where: { username },
      select: { passwordHash: true },
    });

    expect(record?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(
      await verifyPassword('NewPassw0rd!1', record?.passwordHash ?? ''),
    ).toBe(true);

    const audit = await latestAuditFor('USER_CREATE', response.body.data.id);

    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(admin.id);
    expect(audit?.afterJson).toContain(username);
    expect(audit?.afterJson).not.toContain('passwordHash');
    expect(audit?.afterJson).not.toContain('NewPassw0rd!1');
  });

  it('重复用户名返回 409 DUPLICATE', async () => {
    const first = await createUser();
    const duplicate = await createUser({ username: first.username });

    expect(first.response.status).toBe(201);
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.response.body.code).toBe('DUPLICATE');
    expect(duplicate.response.body.message).toBe('用户名已存在。');
  });

  it('创建与更新入参经过校验', async () => {
    const invalidCases = [
      { username: 'ab' },
      { username: 'bad user' },
      { password: 'short' },
      { password: 'x'.repeat(73) },
      { role: 'OWNER' },
      { displayName: '' },
      { displayName: 'x'.repeat(51) },
      { unexpected: true },
    ];

    for (const invalid of invalidCases) {
      const response = await createUser(invalid);

      expect(response.response.status).toBe(400);
      expect(response.response.body.code).toBe('VALIDATION_ERROR');
    }

    const emptyUpdate = await adminAgent
      .patch(`/api/v1/users/${admin.id}`)
      .set(AJAX_HEADERS)
      .send({});

    expect(emptyUpdate.status).toBe(400);
    expect(emptyUpdate.body.code).toBe('VALIDATION_ERROR');
    expect(emptyUpdate.body.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '至少需要修改一个字段。' }),
      ]),
    );
  });

  it('管理员更新用户资料与角色，变更立即生效并留痕', async () => {
    const created = await createUser();
    const target = created.response.body.data;
    const targetAgent = (
      await loginAs(context.app, created.username, 'NewPassw0rd!1')
    ).agent;

    const before = await targetAgent.get('/api/v1/auth/me');

    expect(before.body.data.user.role).toBe('EDITOR');

    const updated = await adminAgent
      .patch(`/api/v1/users/${target.id}`)
      .set(AJAX_HEADERS)
      .send({ displayName: '审核员甲', role: 'REVIEWER' });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      id: target.id,
      displayName: '审核员甲',
      role: 'REVIEWER',
    });

    const after = await targetAgent.get('/api/v1/auth/me');

    expect(after.status).toBe(200);
    expect(after.body.data.user.role).toBe('REVIEWER');

    const audit = await latestAuditFor('USER_UPDATE', target.id);

    expect(audit).toMatchObject({
      actorId: admin.id,
      actorRole: 'ADMIN',
    });
    expect(audit?.beforeJson).toContain('"role":"EDITOR"');
    expect(audit?.afterJson).toContain('"role":"REVIEWER"');
    expect(audit?.beforeJson).not.toContain('passwordHash');
    expect(audit?.afterJson).not.toContain('passwordHash');
  });

  it('管理员不能修改自己的角色或禁用自己', async () => {
    const promote = await adminAgent
      .patch(`/api/v1/users/${admin.id}`)
      .set(AJAX_HEADERS)
      .send({ role: 'EDITOR' });
    const disable = await adminAgent
      .patch(`/api/v1/users/${admin.id}`)
      .set(AJAX_HEADERS)
      .send({ isActive: false });

    expect(promote.status).toBe(400);
    expect(promote.body.code).toBe('VALIDATION_ERROR');
    expect(disable.status).toBe(400);
    expect(disable.body.code).toBe('VALIDATION_ERROR');

    const rename = await adminAgent
      .patch(`/api/v1/users/${admin.id}`)
      .set(AJAX_HEADERS)
      .send({ displayName: '管理员甲' });

    expect(rename.status).toBe(200);
    expect(rename.body.data.displayName).toBe('管理员甲');

    const me = await adminAgent.get('/api/v1/auth/me');

    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe('ADMIN');
    expect(me.body.data.user.isActive).toBe(true);
  });

  it('禁用用户后其会话立即失效', async () => {
    const created = await createUser();
    const target = created.response.body.data;
    const login = await loginAs(
      context.app,
      created.username,
      'NewPassw0rd!1',
    );
    const oldCookie = sessionCookie(login.response);

    const disabled = await adminAgent
      .patch(`/api/v1/users/${target.id}`)
      .set(AJAX_HEADERS)
      .send({ isActive: false });

    expect(disabled.status).toBe(200);
    expect(disabled.body.data.isActive).toBe(false);

    const oldSession = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Cookie', oldCookie);

    expect(oldSession.status).toBe(401);

    const audit = await latestAuditFor('USER_DISABLE', target.id);

    expect(audit).toMatchObject({ actorId: admin.id });
    expect(audit?.beforeJson).toContain('"isActive":true');
    expect(audit?.afterJson).toContain('"isActive":false');
  });

  it('管理员重置密码后旧会话与旧密码失效', async () => {
    const created = await createUser();
    const target = created.response.body.data;
    const login = await loginAs(
      context.app,
      created.username,
      'NewPassw0rd!1',
    );
    const oldCookie = sessionCookie(login.response);
    const newPassword = 'ResetPassw0rd!2';

    const reset = await adminAgent
      .post(`/api/v1/users/${target.id}/reset-password`)
      .set(AJAX_HEADERS)
      .send({ newPassword });

    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ id: target.id });

    const oldSession = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Cookie', oldCookie);

    expect(oldSession.status).toBe(401);

    const oldPasswordLogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: created.username, password: 'NewPassw0rd!1' });

    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: created.username, password: newPassword });

    expect(newPasswordLogin.status).toBe(200);

    const audit = await latestAuditFor('USER_UPDATE', target.id);

    expect(audit).toMatchObject({
      actorId: admin.id,
      reason: 'ADMIN_RESET_PASSWORD',
    });
    expect(audit?.afterJson).toContain('"passwordReset":true');
    expect(audit?.afterJson).not.toContain('passwordHash');
    expect(audit?.afterJson).not.toContain(newPassword);
  });

  it('更新或重置不存在的用户返回 404', async () => {
    const missingId = 'missing-user-id';
    const update = await adminAgent
      .patch(`/api/v1/users/${missingId}`)
      .set(AJAX_HEADERS)
      .send({ displayName: '不存在' });
    const reset = await adminAgent
      .post(`/api/v1/users/${missingId}/reset-password`)
      .set(AJAX_HEADERS)
      .send({ newPassword: 'ResetPassw0rd!2' });

    expect(update.status).toBe(404);
    expect(update.body.code).toBe('NOT_FOUND');
    expect(reset.status).toBe(404);
    expect(reset.body.code).toBe('NOT_FOUND');
  });

  it('缺少 X-Requested-With 的管理写操作返回 403', async () => {
    const create = await adminAgent
      .post('/api/v1/users')
      .send({
        username: uniqueUsername('ajax.user'),
        password: 'NewPassw0rd!1',
        displayName: '缺少头',
        role: 'VIEWER',
      });
    const update = await adminAgent
      .patch(`/api/v1/users/${admin.id}`)
      .send({ displayName: '缺少头' });

    expect(create.status).toBe(403);
    expect(create.body.code).toBe('FORBIDDEN');
    expect(update.status).toBe(403);
    expect(update.body.code).toBe('FORBIDDEN');
  });
});
