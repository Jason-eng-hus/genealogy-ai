import {
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { AuditLogItem } from '@shared/types/audit.ts';
import { renderAppAt } from './support/render';

const authMocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  fetchAuditLogs: vi.fn(),
}));

vi.mock('@/auth/session', () => ({
  fetchCurrentUser: authMocks.fetchCurrentUser,
  login: vi.fn(),
  logout: vi.fn(),
  isUnauthorizedError: (error: unknown) =>
    (error as { status?: number } | null)?.status === 401,
}));

vi.mock('@/api/health', () => ({
  fetchHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    version: '0.1.0',
    uptimeSeconds: 10,
    timestamp: '2026-10-22T00:00:00.000Z',
    database: {
      status: 'ok',
      latencyMs: 2,
    },
  }),
}));

vi.mock('@/api/audit', () => ({
  fetchAuditLogs: auditMocks.fetchAuditLogs,
}));

function makeItem(
  overrides: Partial<AuditLogItem> = {},
): AuditLogItem {
  return {
    id: 'log-1',
    createdAt: '2026-10-20T04:00:00.000Z',
    action: 'PERSON_UPDATE',
    actorRole: 'ADMIN',
    actor: {
      id: 'user-admin',
      username: 'admin',
      displayName: '管理员',
    },
    entityType: 'Person',
    entityId: 'person-1',
    reason: '修正生年',
    requestId: 'req-1',
    before: { name: '张三', birthYear: 1900 },
    after: { name: '张三', birthYear: 1901 },
    changes: [
      {
        path: 'birthYear',
        kind: 'CHANGED',
        before: 1900,
        after: 1901,
      },
    ],
    redacted: false,
    ...overrides,
  };
}

const maskedItem = makeItem({
  id: 'log-2',
  action: 'SOURCE_UPDATE',
  entityType: 'Source',
  entityId: 'source-1',
  reason: null,
  before: { token: '[已隐藏]', title: '族谱' },
  after: { token: '[已隐藏]', title: '族谱（修订）' },
  changes: [],
  redacted: true,
});

function page(items: AuditLogItem[], total = items.length) {
  return {
    items,
    total,
    page: 1,
    pageSize: 20,
  };
}

beforeEach(() => {
  authMocks.fetchCurrentUser.mockReset();
  auditMocks.fetchAuditLogs.mockReset();

  authMocks.fetchCurrentUser.mockResolvedValue({
    id: 'user-admin',
    username: 'admin',
    displayName: '管理员',
    role: 'ADMIN',
    isActive: true,
  });
});

describe('审计查询页面', () => {
  it('展示审计列表、动作标签、操作人与遮罩标记', async () => {
    auditMocks.fetchAuditLogs.mockResolvedValue(
      page([makeItem(), maskedItem], 2),
    );

    renderAppAt('/audit');

    expect(await screen.findByText('更新人物')).toBeInTheDocument();
    expect(screen.getByText('更新来源')).toBeInTheDocument();
    expect(screen.getAllByText('admin · 管理员')).toHaveLength(2);
    expect(screen.getByText('person-1')).toBeInTheDocument();
    expect(screen.getByText('修正生年')).toBeInTheDocument();
    expect(screen.getByText('1 项')).toBeInTheDocument();
    expect(screen.getByText('已遮罩')).toBeInTheDocument();
    expect(screen.getByText('共 2 条记录')).toBeInTheDocument();
    expect(screen.getByText('无变化')).toBeInTheDocument();
  });

  it('详情抽屉展示字段差异与前后快照', async () => {
    auditMocks.fetchAuditLogs.mockResolvedValue(page([makeItem()]));

    renderAppAt('/audit');

    await screen.findByText('更新人物');
    fireEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(await screen.findByText('字段差异')).toBeInTheDocument();
    expect(screen.getByText('birthYear')).toBeInTheDocument();
    expect(screen.getByText('变更前快照')).toBeInTheDocument();
    expect(screen.getByText('变更后快照')).toBeInTheDocument();
    expect(
      screen.getByText(
        '出于 L3 保密要求，IP 地址与 User-Agent 不在此展示。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('req-1')).toBeInTheDocument();
  });

  it('权限与遮罩说明抽屉展示角色矩阵和导出策略', async () => {
    auditMocks.fetchAuditLogs.mockResolvedValue(page([]));

    renderAppAt('/audit');

    await screen.findByText('暂无审计记录');
    fireEvent.click(
      screen.getByRole('button', { name: /权限与遮罩说明/ }),
    );

    expect(
      await screen.findByText('审计查询仅对管理员与审核员开放'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('强制遮罩 L3 敏感字段').length,
    ).toBe(2);
    expect(
      screen.getAllByText('仅受控导出（本期未开放）').length,
    ).toBe(2);
    expect(screen.getAllByText('不可查看')).toHaveLength(2);
    expect(
      screen.getByText(/审计日志由数据库触发器保证只追加/),
    ).toBeInTheDocument();
  });

  it('筛选与重置会重置分页并携带筛选参数', async () => {
    auditMocks.fetchAuditLogs.mockResolvedValue(page([]));

    renderAppAt('/audit');

    await screen.findByText('暂无审计记录');
    fireEvent.change(
      screen.getByPlaceholderText('精确匹配实体 ID'),
      { target: { value: 'person-1' } },
    );
    fireEvent.change(
      screen.getByPlaceholderText('用户名或显示名'),
      { target: { value: 'admin' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }));

    await waitFor(() => {
      expect(auditMocks.fetchAuditLogs).toHaveBeenLastCalledWith({
        entityId: 'person-1',
        actor: 'admin',
        page: 1,
        pageSize: 20,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));

    await waitFor(() => {
      const lastCall = auditMocks.fetchAuditLogs.mock
        .calls.at(-1)?.[0];

      expect(lastCall).toEqual({ page: 1, pageSize: 20 });
    });
  });

  it('服务端分页可切换到下一页', async () => {
    auditMocks.fetchAuditLogs.mockImplementation(
      async (query: { page?: number; pageSize?: number }) => ({
        items: [makeItem()],
        total: 45,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      }),
    );

    renderAppAt('/audit');

    await screen.findByText('更新人物');
    fireEvent.click(screen.getByTitle('2'));

    await waitFor(() => {
      expect(auditMocks.fetchAuditLogs).toHaveBeenLastCalledWith({
        page: 2,
        pageSize: 20,
      });
    });
    expect(
      await screen.findByText('第 21-40 条 / 共 45 条'),
    ).toBeInTheDocument();
  });

  it('加载失败时显示错误与重试按钮', async () => {
    auditMocks.fetchAuditLogs
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockResolvedValueOnce(page([makeItem()]));

    renderAppAt('/audit');

    expect(
      await screen.findByText('审计日志加载失败'),
    ).toBeInTheDocument();
    expect(screen.getByText('网络错误')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    expect(await screen.findByText('更新人物')).toBeInTheDocument();
    expect(auditMocks.fetchAuditLogs).toHaveBeenCalledTimes(2);
  });
});
