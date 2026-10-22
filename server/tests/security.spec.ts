import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthTestContext } from './support/auth-app.ts';
import {
  AJAX_HEADERS,
  createAuthTestContext,
  loginAs,
  seededUser,
  TEST_PASSWORD,
} from './support/auth-app.ts';

describe('跨源与安全响应基线', () => {
  let context: AuthTestContext;

  beforeEach(async () => {
    context = await createAuthTestContext({ label: 'security' });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('允许来自白名单 Origin 且带自定义头的登录请求', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe('OK');
  });

  it('缺少 Origin 的变更请求返回 403', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('不在白名单内的 Origin 返回 403', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Origin', 'https://attacker.example.com')
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('不透明 Origin（null）返回 403', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Origin', 'null')
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('Origin 合法但缺少 X-Requested-With 仍返回 403', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set('Origin', AJAX_HEADERS.Origin)
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('接受与请求同源的 Origin，即使未列入白名单', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set('Host', 'genealogy.test')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Origin', 'http://genealogy.test')
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe('OK');
  });

  it('被拒绝的登出请求不会清除会话', async () => {
    const admin = seededUser(context, 'ADMIN');
    const { agent, response: loginResponse } = await loginAs(
      context.app,
      admin.username,
    );
    expect(loginResponse.status).toBe(200);

    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(logout.status).toBe(403);
    expect(logout.body.code).toBe('FORBIDDEN');

    const me = await agent.get('/api/v1/auth/me');

    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe(admin.username);
  });

  it('安全 GET 请求不要求 Origin 校验', async () => {
    const admin = seededUser(context, 'ADMIN');
    const { agent } = await loginAs(context.app, admin.username);

    const me = await agent
      .get('/api/v1/auth/me')
      .set('Origin', 'https://attacker.example.com');

    expect(me.status).toBe(200);
  });

  it('API 响应携带 no-store 与安全头', async () => {
    const response = await request(context.app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.vary).toBe('Origin');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'same-origin',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('被拒绝的请求同样携带安全响应头', async () => {
    const user = seededUser(context, 'ADMIN');
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });
});
