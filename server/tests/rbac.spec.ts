import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../../shared/src/constants/enums.ts';
import { getPrisma } from '../src/lib/prisma.ts';
import type { AuthTestContext } from './support/auth-app.ts';
import {
  AJAX_HEADERS,
  createAuthTestContext,
  loginAs,
  seededUser,
} from './support/auth-app.ts';

describe('RBAC 权限矩阵', () => {
  let context: AuthTestContext;

  beforeEach(async () => {
    context = await createAuthTestContext({ label: 'rbac' });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  async function loginRole(role: Role) {
    const user = seededUser(context, role);
    const { agent, response } = await loginAs(context.app, user.username);

    expect(response.status).toBe(200);

    return agent;
  }

  it('四种角色均可访问仪表盘', async () => {
    for (const role of ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const) {
      const agent = await loginRole(role);
      const response = await agent.get('/api/v1/dashboard');

      expect(response.status, role).toBe(200);
      expect(response.body.code).toBe('OK');
    }
  });

  it('仅 ADMIN 可访问用户管理', async () => {
    for (const role of ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const) {
      const agent = await loginRole(role);
      const response = await agent.get('/api/v1/users');

      if (role === 'ADMIN') {
        expect(response.status, role).toBe(200);
        expect(response.body.code).toBe('OK');
      } else {
        expect(response.status, role).toBe(403);
        expect(response.body.code).toBe('FORBIDDEN');
        expect(response.body.data).toBeNull();
      }
    }
  });

  it('匿名请求先返回 401 而不是 403', async () => {
    const dashboard = await request(context.app).get('/api/v1/dashboard');
    const users = await request(context.app).get('/api/v1/users');

    expect(dashboard.status).toBe(401);
    expect(dashboard.body.code).toBe('AUTH_REQUIRED');
    expect(users.status).toBe(401);
    expect(users.body.code).toBe('AUTH_REQUIRED');
  });

  it('EDITOR 越权创建用户返回 403 且不写库', async () => {
    const editor = await loginRole('EDITOR');
    const before = await getPrisma().user.count();

    const response = await editor
      .post('/api/v1/users')
      .set(AJAX_HEADERS)
      .send({
        username: 'rbac.forbidden.user',
        password: 'Forbidden0!23',
        displayName: '越权用户',
        role: 'VIEWER',
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(await getPrisma().user.count()).toBe(before);
    expect(
      await getPrisma().user.findUnique({
        where: { username: 'rbac.forbidden.user' },
      }),
    ).toBeNull();
  });
});
