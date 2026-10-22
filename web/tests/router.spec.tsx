import { screen } from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { renderAppAt } from './support/render';

const authMocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
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
  fetchAuditLogs: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  }),
}));

beforeEach(() => {
  authMocks.fetchCurrentUser.mockReset();
  authMocks.fetchCurrentUser.mockResolvedValue({
    id: 'user-admin',
    username: 'admin',
    displayName: '管理员',
    role: 'ADMIN',
    isActive: true,
  });
});

describe('前端路由骨架', () => {
  it('渲染仪表盘占位页、导航与服务状态', async () => {
    renderAppAt('/');

    expect(
      await screen.findByText(
        '家族档案概况、待办事项与来源覆盖率。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /家谱树/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText('服务正常')).toBeInTheDocument();
  });

  it('渲染家谱树占位页', async () => {
    renderAppAt('/tree');

    expect(
      await screen.findByText(
        '祖先、后代与全谱视图，支持定位与分支展开。',
      ),
    ).toBeInTheDocument();
  });

  it('人物详情使用占位页并保持人物菜单选中', async () => {
    renderAppAt('/persons/42');

    expect(
      await screen.findByText(
        '人物档案、亲属关系、事件与引用详情。',
      ),
    ).toBeInTheDocument();

    const personMenuItem = screen.getByRole('menuitem', {
      name: /人物/,
    });
    expect(personMenuItem).toHaveClass('ant-menu-item-selected');
  });

  it('未知路径显示 404 页', async () => {
    renderAppAt('/does-not-exist');

    expect(await screen.findByText('404')).toBeInTheDocument();
    expect(
      screen.getByText('您访问的页面不存在，可能已被移动或删除。'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '返回仪表盘' }),
    ).toBeInTheDocument();
  });

  it('已登录访问登录页会回到主布局', async () => {
    renderAppAt('/login');

    expect(
      await screen.findByText(
        '家族档案概况、待办事项与来源覆盖率。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /家谱树/ }),
    ).toBeInTheDocument();
  });
});
