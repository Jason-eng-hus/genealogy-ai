import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { getPrisma } from '../src/lib/prisma.ts';
import type { AuthTestContext } from './support/auth-app.ts';
import {
  createAuthTestContext,
  loginAs,
  seededUser,
} from './support/auth-app.ts';

describe('仪表盘统计', () => {
  let context: AuthTestContext;

  beforeAll(async () => {
    context = await createAuthTestContext({ label: 'dashboard' });

    const prisma = getPrisma();
    const admin = seededUser(context, 'ADMIN');
    const family = await prisma.family.create({
      data: { name: '仪表盘测试家族' },
    });
    const [personOne, personTwo, personThree] = await Promise.all([
      prisma.person.create({
        data: {
          familyId: family.id,
          surname: '张',
          givenName: '一',
          livingStatus: 'LIVING',
        },
      }),
      prisma.person.create({
        data: {
          familyId: family.id,
          surname: '张',
          givenName: '二',
          livingStatus: 'DECEASED',
        },
      }),
      prisma.person.create({
        data: {
          familyId: family.id,
          surname: '张',
          givenName: '三',
          livingStatus: 'LIVING',
        },
      }),
    ]);
    const mergedPerson = await prisma.person.create({
      data: {
        familyId: family.id,
        surname: '张',
        givenName: '四',
        livingStatus: 'DECEASED',
        status: 'MERGED',
      },
    });
    await prisma.person.create({
      data: {
        familyId: family.id,
        surname: '张',
        givenName: '五',
        livingStatus: 'DECEASED',
        status: 'DELETED',
      },
    });

    const [sourceOne, sourceTwo] = await Promise.all([
      prisma.source.create({
        data: { type: 'TEXT', title: '族谱手稿' },
      }),
      prisma.source.create({
        data: { type: 'ORAL', title: '口述记录' },
      }),
    ]);

    await prisma.citation.createMany({
      data: [
        {
          sourceId: sourceOne.id,
          targetType: 'PERSON',
          targetId: personOne.id,
          fieldPath: 'birthYear',
          quote: '生于壬寅年',
        },
        {
          sourceId: sourceTwo.id,
          targetType: 'PERSON',
          targetId: personTwo.id,
          fieldPath: 'deathYear',
          quote: '卒于戊申年',
        },
        {
          sourceId: sourceOne.id,
          targetType: 'PERSON',
          targetId: mergedPerson.id,
          fieldPath: 'birthYear',
          quote: '合并人物不计入覆盖率',
        },
        {
          sourceId: sourceOne.id,
          targetType: 'RELATION',
          targetId: 'relation-not-counted',
          fieldPath: 'certainty',
          quote: '关系引用不计入人物覆盖率',
        },
      ],
    });

    await prisma.consistencyIssue.createMany({
      data: [
        {
          code: 'MISSING_BIRTH_DATE',
          severity: 'WARNING',
          entityType: 'Person',
          entityId: personThree.id,
          message: '缺少出生日期',
          dedupeKey: 'dashboard-issue-open',
        },
        {
          code: 'MISSING_BIRTH_DATE',
          severity: 'WARNING',
          entityType: 'Person',
          entityId: personThree.id,
          message: '已忽略的问题',
          dedupeKey: 'dashboard-issue-ignored',
          status: 'IGNORED',
        },
      ],
    });

    const job = await prisma.aiJob.create({
      data: {
        kind: 'EXTRACT',
        status: 'SUCCEEDED',
        provider: 'mock',
        promptVersion: 'v1',
        inputHash: 'dashboard-input-hash',
      },
    });

    await prisma.aiDraft.createMany({
      data: [
        {
          jobId: job.id,
          draftType: 'PERSON',
          tempId: 'dashboard-pending-draft',
          payloadJson: '{}',
          sourceQuote: '待审草稿',
          confidence: 0.9,
        },
        {
          jobId: job.id,
          draftType: 'PERSON',
          tempId: 'dashboard-accepted-draft',
          payloadJson: '{}',
          sourceQuote: '已接受草稿',
          confidence: 0.8,
          status: 'ACCEPTED',
        },
      ],
    });

    await prisma.reviewRequest.createMany({
      data: [
        {
          action: 'DELETE_PERSON',
          payloadJson: '{}',
          diffJson: '{}',
          requestedById: admin.id,
          expectedVersionsJson: '{}',
        },
        {
          action: 'DELETE_PERSON',
          payloadJson: '{}',
          diffJson: '{}',
          requestedById: admin.id,
          expectedVersionsJson: '{}',
          status: 'APPROVED',
        },
      ],
    });
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('返回真实统计与来源覆盖率', async () => {
    const admin = seededUser(context, 'ADMIN');
    const { agent, response: loginResponse } = await loginAs(
      context.app,
      admin.username,
    );
    expect(loginResponse.status).toBe(200);

    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.code).toBe('OK');
    expect(response.body.data).toEqual({
      personCount: 3,
      livingPersonCount: 2,
      sourceCount: 2,
      openIssueCount: 1,
      pendingDraftCount: 1,
      pendingReviewCount: 1,
      sourceCoverage: {
        coveredPersonCount: 2,
        totalPersonCount: 3,
        ratio: 0.6667,
      },
    });
  });

  it('四种角色都可读取同一份统计', async () => {
    for (const role of ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const) {
      const user = seededUser(context, role);
      const { agent } = await loginAs(context.app, user.username);
      const response = await agent.get('/api/v1/dashboard');

      expect(response.status, role).toBe(200);
      expect(response.body.data.personCount, role).toBe(3);
    }
  });

  it('匿名访问返回 401', async () => {
    const response = await request(context.app).get('/api/v1/dashboard');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_REQUIRED');
  });
});

describe('空库仪表盘', () => {
  let context: AuthTestContext;

  beforeAll(async () => {
    context = await createAuthTestContext({ label: 'dashboard-empty' });
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('返回全零统计且覆盖率为 0', async () => {
    const viewer = seededUser(context, 'VIEWER');
    const { agent } = await loginAs(context.app, viewer.username);
    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      personCount: 0,
      livingPersonCount: 0,
      sourceCount: 0,
      openIssueCount: 0,
      pendingDraftCount: 0,
      pendingReviewCount: 0,
      sourceCoverage: {
        coveredPersonCount: 0,
        totalPersonCount: 0,
        ratio: 0,
      },
    });
  });
});
