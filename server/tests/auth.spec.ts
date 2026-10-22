import type { Response } from 'supertest';
import request from 'supertest';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { getPrisma } from '../src/lib/prisma.ts';
import type { AuthTestContext } from './support/auth-app.ts';
import {
  AJAX_HEADERS,
  createAuthTestContext,
  loginAs,
  seededUser,
  TEST_PASSWORD,
} from './support/auth-app.ts';

function setCookieHeader(response: Response): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : [header];
  const cookie = values.find(
    (value): value is string =>
      typeof value === 'string' && value.startsWith('genealogy_session='),
  );

  if (cookie === undefined) {
    throw new Error('Session cookie is missing from the response.');
  }

  return cookie;
}

function sessionCookie(response: Response): string {
  const cookie = setCookieHeader(response);

  return cookie.split(';')[0];
}

function isCookieCleared(cookie: string): boolean {
  return (
    /^genealogy_session=;/.test(cookie) ||
    /Expires=Thu, 01 Jan 1970/.test(cookie)
  );
}

async function latestAudit(action: string) {
  return getPrisma().auditLog.findFirst({
    where: { action },
    orderBy: { createdAt: 'desc' },
  });
}

describe('认证与会话', () => {
  let context: AuthTestContext;

  beforeEach(async () => {
    context = await createAuthTestContext({ label: 'auth-core' });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('支持四种角色登录并签发安全 Cookie', async () => {
    for (const role of ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const) {
      const user = seededUser(context, role);
      const { response } = await loginAs(context.app, user.username);

      expect(response.status).toBe(200);
      expect(response.body.code).toBe('OK');
      expect(response.body.data.user).toMatchObject({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role,
        isActive: true,
      });
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
      expect(response.body.data.user).not.toHaveProperty('token');

      const cookie = setCookieHeader(response);

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=3600');
      expect(cookie).not.toMatch(/;\s*Secure/i);
    }
  });

  it('有效会话可读取当前用户，匿名请求返回 401', async () => {
    const anonymous = await request(context.app).get('/api/v1/auth/me');

    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe('AUTH_REQUIRED');
    expect(anonymous.body.requestId).toBeTruthy();

    const user = seededUser(context, 'REVIEWER');
    const { agent } = await loginAs(context.app, user.username);
    const me = await agent.get('/api/v1/auth/me');

    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({
      id: user.id,
      username: user.username,
      role: 'REVIEWER',
    });
    expect(me.body.data.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');
  });

  it('错误密码与不存在账号返回相同的 401 提示并写审计', async () => {
    const user = seededUser(context, 'EDITOR');
    const wrongPassword = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: user.username, password: 'WrongPassw0rd!' });
    const unknownUser = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: 'missing-user', password: 'WrongPassw0rd!' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.code).toBe('AUTH_REQUIRED');
    expect(unknownUser.body.code).toBe('AUTH_REQUIRED');
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
    expect(wrongPassword.body.message).toBe('用户名或密码错误。');

    const failedKnown = await getPrisma().auditLog.findFirst({
      where: { action: 'AUTH_LOGIN_FAILED', actorId: user.id },
    });
    const failedUnknown = await getPrisma().auditLog.findFirst({
      where: { action: 'AUTH_LOGIN_FAILED', actorId: null },
    });

    expect(failedKnown).toMatchObject({
      actorRole: 'EDITOR',
      reason: 'INVALID_CREDENTIALS',
    });
    expect(failedUnknown).toMatchObject({
      actorRole: 'ANONYMOUS',
      reason: 'INVALID_CREDENTIALS',
    });
    expect(failedUnknown?.afterJson).toContain('missing-user');
  });

  it('登录成功写入 AUTH_LOGIN 审计并透传 requestId', async () => {
    const user = seededUser(context, 'ADMIN');
    const requestId = 'test-request-id-login-001';
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .set('X-Request-Id', requestId)
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe(requestId);

    const audit = await latestAudit('AUTH_LOGIN');

    expect(audit).not.toBeNull();
    expect(audit).toMatchObject({
      actorId: user.id,
      actorRole: 'ADMIN',
      entityType: 'User',
      entityId: user.id,
      requestId,
    });
    expect(audit?.ip).toBeTruthy();
    expect(audit?.afterJson).toContain('admin');

    const refreshed = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { lastLoginAt: true },
    });

    expect(refreshed?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('登录写入的 bcrypt 哈希成本不低于 12', async () => {
    const user = seededUser(context, 'VIEWER');
    const record = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    expect(record?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('缺少 X-Requested-With 的变更请求返回 403', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('非法登录入参返回 400 与字段级错误', async () => {
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: '', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'username' }),
        expect.objectContaining({ path: 'password' }),
      ]),
    );
  });

  it('登出清空会话 Cookie 并写入审计', async () => {
    const user = seededUser(context, 'VIEWER');
    const { agent, response } = await loginAs(
      context.app,
      user.username,
    );

    expect(response.status).toBe(200);

    const logout = await agent
      .post('/api/v1/auth/logout')
      .set(AJAX_HEADERS);

    expect(logout.status).toBe(200);
    expect(isCookieCleared(setCookieHeader(logout))).toBe(true);

    const me = await agent.get('/api/v1/auth/me');

    expect(me.status).toBe(401);

    const audit = await latestAudit('AUTH_LOGOUT');

    expect(audit).toMatchObject({
      actorId: user.id,
      actorRole: 'VIEWER',
      entityId: user.id,
    });
  });

  it('修改密码后旧 Cookie 与旧密码立即失效', async () => {
    const user = seededUser(context, 'EDITOR');
    const { agent, response } = await loginAs(
      context.app,
      user.username,
    );
    const oldCookie = sessionCookie(response);
    const newPassword = 'NewPassw0rd!24';

    const changed = await agent
      .post('/api/v1/auth/change-password')
      .set(AJAX_HEADERS)
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword,
      });

    expect(changed.status).toBe(200);
    expect(isCookieCleared(setCookieHeader(changed))).toBe(true);

    const oldSession = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Cookie', oldCookie);

    expect(oldSession.status).toBe(401);

    const oldLogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(oldLogin.status).toBe(401);

    const newLogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: user.username, password: newPassword });

    expect(newLogin.status).toBe(200);

    const audit = await latestAudit('USER_UPDATE');

    expect(audit).toMatchObject({
      actorId: user.id,
      entityId: user.id,
    });
    expect(audit?.afterJson).toBe(JSON.stringify({ passwordChanged: true }));
    expect(audit?.afterJson).not.toContain('passwordHash');
  });

  it('当前密码错误时拒绝修改密码', async () => {
    const user = seededUser(context, 'EDITOR');
    const { agent } = await loginAs(context.app, user.username);
    const changed = await agent
      .post('/api/v1/auth/change-password')
      .set(AJAX_HEADERS)
      .send({
        currentPassword: 'WrongPassw0rd!',
        newPassword: 'NewPassw0rd!24',
      });

    expect(changed.status).toBe(400);
    expect(changed.body.code).toBe('VALIDATION_ERROR');
    expect(changed.body.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'currentPassword' }),
      ]),
    );
  });
});

describe('登录限流', () => {
  let context: AuthTestContext;

  beforeEach(async () => {
    context = await createAuthTestContext({
      label: 'auth-rate-limit',
      rateLimit: { maxFailures: 2, windowMs: 60_000 },
    });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('连续失败达到阈值后返回 429 并携带 Retry-After', async () => {
    const user = seededUser(context, 'ADMIN');
    const attempt = () =>
      request(context.app)
        .post('/api/v1/auth/login')
        .set(AJAX_HEADERS)
        .send({ username: user.username, password: 'WrongPassw0rd!' });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);

    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    const correct = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(correct.status).toBe(429);

    context.rateLimiter.clear();

    const afterReset = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(afterReset.status).toBe(200);
  });
});

describe('账号禁用后的会话失效', () => {
  let context: AuthTestContext;

  beforeEach(async () => {
    context = await createAuthTestContext({ label: 'auth-disable' });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('禁用账号后旧 Cookie 失效且无法再次登录', async () => {
    const admin = seededUser(context, 'ADMIN');
    const editor = seededUser(context, 'EDITOR');
    const adminLogin = await loginAs(context.app, admin.username);
    const editorLogin = await loginAs(context.app, editor.username);
    const editorCookie = sessionCookie(editorLogin.response);

    const disabled = await adminLogin.agent
      .patch(`/api/v1/users/${editor.id}`)
      .set(AJAX_HEADERS)
      .send({ isActive: false });

    expect(disabled.status).toBe(200);
    expect(disabled.body.data.isActive).toBe(false);

    const oldSession = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Cookie', editorCookie);

    expect(oldSession.status).toBe(401);

    const relogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: editor.username, password: TEST_PASSWORD });

    expect(relogin.status).toBe(401);
    expect(relogin.body.message).toBe('用户名或密码错误。');

    const disableAudit = await latestAudit('USER_DISABLE');

    expect(disableAudit).toMatchObject({
      actorId: admin.id,
      entityId: editor.id,
    });
    expect(disableAudit?.beforeJson).toContain('"isActive":true');
    expect(disableAudit?.afterJson).toContain('"isActive":false');

    const failedAudit = await latestAudit('AUTH_LOGIN_FAILED');

    expect(failedAudit).toMatchObject({
      actorId: editor.id,
      reason: 'ACCOUNT_DISABLED',
    });
  });
});
