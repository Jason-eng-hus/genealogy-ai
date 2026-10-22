import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { getPrisma } from '../src/lib/prisma.ts';
import { REDACTED_VALUE } from '../src/modules/audit/diff.ts';
import type {
  AuthTestContext,
  SeededUser,
} from './support/auth-app.ts';
import {
  AJAX_HEADERS,
  createAuthTestContext,
  loginAs,
  seededUser,
  TEST_PASSWORD,
} from './support/auth-app.ts';

const PERSON_TIME = new Date('2026-10-01T12:00:00.000Z');
const PAGINATION_TIME = new Date('2026-10-02T00:00:00.000Z');

describe('审计查询 API', () => {
  let context: AuthTestContext;
  let admin: SeededUser;
  let editor: SeededUser;
  let reviewer: SeededUser;
  let adminAgent: ReturnType<typeof request.agent>;
  let reviewerAgent: ReturnType<typeof request.agent>;
  let editorAgent: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    context = await createAuthTestContext({ label: 'audit-query' });
    admin = seededUser(context, 'ADMIN');
    editor = seededUser(context, 'EDITOR');
    reviewer = seededUser(context, 'REVIEWER');
    const viewer = seededUser(context, 'VIEWER');

    adminAgent = (await loginAs(context.app, admin.username)).agent;
    reviewerAgent = (await loginAs(context.app, reviewer.username)).agent;
    editorAgent = (await loginAs(context.app, editor.username)).agent;
    viewerAgent = (await loginAs(context.app, viewer.username)).agent;

    await getPrisma().auditLog.createMany({
      data: [
        {
          actorId: admin.id,
          actorRole: 'ADMIN',
          action: 'PERSON_UPDATE',
          entityType: 'Person',
          entityId: 'person-1',
          beforeJson: JSON.stringify({
            name: '张一',
            birthYear: 1900,
          }),
          afterJson: JSON.stringify({
            name: '张一',
            birthYear: 1901,
          }),
          reason: '修正生年',
          requestId: 'req-person-1',
          ip: '203.0.113.9',
          userAgent: 'test-agent',
          createdAt: PERSON_TIME,
        },
        {
          actorId: editor.id,
          actorRole: 'EDITOR',
          action: 'RELATION_CREATE',
          entityType: 'Relation',
          entityId: 'relation-1',
          afterJson: JSON.stringify({ type: 'PARENT_CHILD' }),
          createdAt: new Date('2026-10-01T13:00:00.000Z'),
        },
        {
          actorId: reviewer.id,
          actorRole: 'REVIEWER',
          action: 'EVENT_CREATE',
          entityType: 'Event',
          entityId: 'event-1',
          afterJson: JSON.stringify({ type: 'BIRTH' }),
          createdAt: new Date('2026-10-01T14:00:00.000Z'),
        },
        ...[1, 2, 3, 4, 5].map((index) => ({
          actorId: admin.id,
          actorRole: 'ADMIN',
          action: 'CHECK_RUN',
          entityId: `pagination-${index}`,
          afterJson: JSON.stringify({ checked: index }),
          createdAt: PAGINATION_TIME,
        })),
        {
          actorId: admin.id,
          actorRole: 'ADMIN',
          action: 'PRIVACY_ACK',
          entityId: 'privacy-old',
          createdAt: new Date('2026-10-03T00:00:00.000Z'),
        },
        {
          actorId: admin.id,
          actorRole: 'ADMIN',
          action: 'PRIVACY_ACK',
          entityId: 'privacy-new',
          createdAt: new Date('2026-10-04T00:00:00.000Z'),
        },
        {
          actorId: admin.id,
          actorRole: 'ADMIN',
          action: 'SOURCE_UPDATE',
          entityType: 'Source',
          entityId: 'source-l3',
          beforeJson: JSON.stringify({
            role: 'EDITOR',
            passwordHash: '$2b$old-secret',
            description: '正常说明',
            profile: {
              ip: '203.0.113.9',
              filePath: 'C:\\secret\\a.txt',
              city: '杭州',
            },
          }),
          afterJson: JSON.stringify({
            role: 'REVIEWER',
            passwordHash: '$2b$new-secret',
            description: '正常说明',
            profile: {
              ip: '203.0.113.10',
              filePath: 'C:\\secret\\b.txt',
              city: '杭州',
            },
          }),
          ip: '203.0.113.11',
          userAgent: 'l3-agent',
          createdAt: new Date('2026-10-05T00:00:00.000Z'),
        },
        {
          actorId: admin.id,
          actorRole: 'ADMIN',
          action: 'AI_DRAFT_ACCEPT',
          entityType: 'AiDraft',
          entityId: 'draft-malformed',
          beforeJson: '{not-json',
          afterJson: JSON.stringify({ ok: true }),
          createdAt: new Date('2026-10-06T00:00:00.000Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('匿名访问返回 401', async () => {
    const response = await request(context.app).get(
      '/api/v1/audit-logs',
    );

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_REQUIRED');
  });

  it('ADMIN 与 REVIEWER 可查询，EDITOR 与 VIEWER 返回 403', async () => {
    const adminResponse = await adminAgent.get('/api/v1/audit-logs');
    const reviewerResponse = await reviewerAgent.get(
      '/api/v1/audit-logs',
    );
    const editorResponse = await editorAgent.get('/api/v1/audit-logs');
    const viewerResponse = await viewerAgent.get('/api/v1/audit-logs');

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.code).toBe('OK');
    expect(Array.isArray(adminResponse.body.data.items)).toBe(true);
    expect(reviewerResponse.status).toBe(200);
    expect(editorResponse.status).toBe(403);
    expect(editorResponse.body.code).toBe('FORBIDDEN');
    expect(viewerResponse.status).toBe(403);
    expect(viewerResponse.body.code).toBe('FORBIDDEN');
  });

  it('按动作、实体类型与实体 ID 筛选', async () => {
    const actionResponse = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'PERSON_UPDATE' });

    expect(actionResponse.status).toBe(200);
    expect(actionResponse.body.data.total).toBe(1);

    const item = actionResponse.body.data.items[0];
    expect(item).toMatchObject({
      action: 'PERSON_UPDATE',
      actorRole: 'ADMIN',
      entityType: 'Person',
      entityId: 'person-1',
      reason: '修正生年',
      requestId: 'req-person-1',
      actor: {
        id: admin.id,
        username: 'admin',
        displayName: '管理员',
      },
    });
    expect(item.changes).toEqual([
      {
        path: 'birthYear',
        kind: 'CHANGED',
        before: 1900,
        after: 1901,
      },
    ]);

    const entityResponse = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ entityType: 'Person', entityId: 'person-1' });
    const relationResponse = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ entityType: 'Relation' });

    expect(entityResponse.body.data.total).toBe(1);
    expect(entityResponse.body.data.items[0].entityId).toBe(
      'person-1',
    );
    expect(relationResponse.body.data.total).toBe(1);
    expect(relationResponse.body.data.items[0].entityId).toBe(
      'relation-1',
    );
  });

  it('按操作人用户名与显示名筛选', async () => {
    const byUsername = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'RELATION_CREATE', actor: 'editor' });
    const byDisplayName = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'EVENT_CREATE', actor: '审核' });
    const noMatch = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'RELATION_CREATE', actor: 'nobody' });

    expect(byUsername.status).toBe(200);
    expect(byUsername.body.data.total).toBe(1);
    expect(byUsername.body.data.items[0].actor.username).toBe(
      'editor',
    );
    expect(byDisplayName.body.data.total).toBe(1);
    expect(byDisplayName.body.data.items[0].actor.displayName).toBe(
      '审核员',
    );
    expect(noMatch.body.data.total).toBe(0);
  });

  it('按时间闭区间筛选', async () => {
    const exact = await adminAgent
      .get('/api/v1/audit-logs')
      .query({
        action: 'PERSON_UPDATE',
        from: PERSON_TIME.toISOString(),
        to: PERSON_TIME.toISOString(),
      });
    const later = await adminAgent
      .get('/api/v1/audit-logs')
      .query({
        action: 'PERSON_UPDATE',
        from: '2026-10-02T00:00:00.000Z',
      });
    const earlier = await adminAgent
      .get('/api/v1/audit-logs')
      .query({
        action: 'PERSON_UPDATE',
        to: '2026-09-30T23:59:59.999Z',
      });

    expect(exact.body.data.total).toBe(1);
    expect(later.body.data.total).toBe(0);
    expect(earlier.body.data.total).toBe(0);
  });

  it('同一时间戳分页稳定且不重不漏', async () => {
    const seen: string[] = [];
    let total = 0;

    for (const page of [1, 2, 3]) {
      const response = await adminAgent
        .get('/api/v1/audit-logs')
        .query({ action: 'CHECK_RUN', page, pageSize: 2 });

      expect(response.status).toBe(200);
      total = response.body.data.total;
      seen.push(
        ...response.body.data.items.map(
          (item: { id: string }) => item.id,
        ),
      );
    }

    const beyond = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'CHECK_RUN', page: 99, pageSize: 2 });

    expect(total).toBe(5);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(beyond.body.data.items).toEqual([]);
    expect(beyond.body.data.total).toBe(5);
  });

  it('默认分页为 20 且按时间倒序', async () => {
    const response = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'PRIVACY_ACK' });

    expect(response.status).toBe(200);
    expect(response.body.data.page).toBe(1);
    expect(response.body.data.pageSize).toBe(20);
    expect(
      response.body.data.items.map(
        (item: { entityId: string }) => item.entityId,
      ),
    ).toEqual(['privacy-new', 'privacy-old']);
  });

  it('不返回 IP、用户代理与敏感快照值', async () => {
    const response = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'SOURCE_UPDATE', entityId: 'source-l3' });

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);

    const item = response.body.data.items[0];
    const serialized = JSON.stringify(item);

    expect(item).not.toHaveProperty('ip');
    expect(item).not.toHaveProperty('userAgent');
    expect(serialized).not.toContain('203.0.113.9');
    expect(serialized).not.toContain('203.0.113.10');
    expect(serialized).not.toContain('203.0.113.11');
    expect(serialized).not.toContain('l3-agent');
    expect(serialized).not.toContain('$2b$old-secret');
    expect(serialized).not.toContain('$2b$new-secret');
    expect(serialized).not.toContain('a.txt');
    expect(serialized).not.toContain('b.txt');

    expect(item.redacted).toBe(true);
    expect(item.after.passwordHash).toBe(REDACTED_VALUE);
    expect(item.after.profile.ip).toBe(REDACTED_VALUE);
    expect(item.after.profile.filePath).toBe(REDACTED_VALUE);
    expect(item.after.profile.city).toBe('杭州');
    expect(item.after.description).toBe('正常说明');
    expect(item.changes).toEqual([
      {
        path: 'role',
        kind: 'CHANGED',
        before: 'EDITOR',
        after: 'REVIEWER',
      },
    ]);
  });

  it('畸形快照不会导致 500', async () => {
    const response = await adminAgent
      .get('/api/v1/audit-logs')
      .query({
        action: 'AI_DRAFT_ACCEPT',
        entityId: 'draft-malformed',
      });

    expect(response.status).toBe(200);

    const item = response.body.data.items[0];
    expect(item.before).toBeNull();
    expect(item.after).toEqual({ ok: true });
    expect(item.changes).toEqual([
      {
        path: 'ok',
        kind: 'ADDED',
        before: null,
        after: true,
      },
    ]);
  });

  it('匿名操作人保留当时角色快照', async () => {
    const failedLogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set(AJAX_HEADERS)
      .send({
        username: 'missing.user',
        password: TEST_PASSWORD,
      });

    expect(failedLogin.status).toBe(401);

    const response = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'AUTH_LOGIN_FAILED' });

    expect(response.status).toBe(200);

    const item = response.body.data.items[0];
    expect(item.actor).toBeNull();
    expect(item.actorRole).toBe('ANONYMOUS');
    expect(item.after).toEqual({ username: 'missing.user' });
    expect(item.reason).toBe('INVALID_CREDENTIALS');
  });

  it('非法筛选条件返回 400', async () => {
    const invalidAction = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'NOT_A_REAL_ACTION' });
    const invalidPageSize = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ pageSize: 101 });
    const invalidRange = await adminAgent
      .get('/api/v1/audit-logs')
      .query({
        from: '2026-10-02T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
      });
    const unknownParam = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ unexpected: 'value' });

    for (const response of [
      invalidAction,
      invalidPageSize,
      invalidRange,
      unknownParam,
    ]) {
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('只读 GET 不要求 trusted request 头', async () => {
    const response = await adminAgent
      .get('/api/v1/audit-logs')
      .query({ action: 'AUTH_LOGIN' });

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBeGreaterThanOrEqual(4);
  });

  it('不提供创建、修改或删除接口', async () => {
    const post = await adminAgent
      .post('/api/v1/audit-logs')
      .set(AJAX_HEADERS)
      .send({});
    const patch = await adminAgent
      .patch('/api/v1/audit-logs')
      .set(AJAX_HEADERS)
      .send({});
    const remove = await adminAgent
      .delete('/api/v1/audit-logs')
      .set(AJAX_HEADERS);

    for (const response of [post, patch, remove]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    }
  });
});
