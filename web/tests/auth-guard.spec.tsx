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
import type { Role } from '@shared/constants/enums.ts';
import { renderAppAt } from './support/render';

const authMocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  fetchAuditLogs: vi.fn(),
}));

vi.mock('@/auth/session', () => ({
  fetchCurrentUser: authMocks.fetchCurrentUser,
  login: authMocks.login,
  logout: authMocks.logout,
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

function sessionUser(role: Role) {
  return {
    id: `user-${role.toLowerCase()}`,
    username: role.toLowerCase(),
    displayName: `${role} 用户`,
    role,
    isActive: true,
  };
}

function unauthorizedError(): Error {
  return Object.assign(new Error('请先登录。'), { status: 401 });
}

beforeEach(() => {
  authMocks.fetchCurrentUser.mockReset();
  authMocks.login.mockReset();
  authMocks.logout.mockReset();
  auditMocks.fetchAuditLogs.mockReset();

  authMocks.fetchCurrentUser.mockRejectedValue(unauthorizedError());
  authMocks.logout.mockResolvedValue(undefined);
  auditMocks.fetchAuditLogs.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
});

describe('认证守卫与登录桥接', () => {
  it('未登录访问审计页会跳转到登录页且不请求审计数据', async () => {
    renderAppAt('/audit');

    expect(
      await screen.findByText('登录 AI 家谱编辑系统'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(auditMocks.fetchAuditLogs).not.toHaveBeenCalled();
  });

  it('登录成功后跳转到 redirect 指定的站内路径', async () => {
    authMocks.login.mockResolvedValue(sessionUser('ADMIN'));
    renderAppAt('/login?redirect=%2Fpersons%2F42');

    await screen.findByText('登录 AI 家谱编辑系统');
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'Passw0rd!23' },
    });
    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(
      await screen.findByText(
        '人物档案、亲属关系、事件与引用详情。',
      ),
    ).toBeInTheDocument();
    expect(authMocks.login).toHaveBeenCalledWith(
      'admin',
      'Passw0rd!23',
    );
  });

  it('登录后忽略外部 redirect，回到仪表盘', async () => {
    authMocks.login.mockResolvedValue(sessionUser('ADMIN'));
    const view = renderAppAt(
      '/login?redirect=https%3A%2F%2Fevil.example',
    );

    await screen.findByText('登录 AI 家谱编辑系统');
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'Passw0rd!23' },
    });
    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(
      await screen.findByText(
        '家族档案概况、待办事项与来源覆盖率。',
      ),
    ).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/');
  });

  it.each([
    { role: 'ADMIN' as const, audit: true, users: true },
    { role: 'REVIEWER' as const, audit: true, users: false },
    { role: 'EDITOR' as const, audit: false, users: false },
    { role: 'VIEWER' as const, audit: false, users: false },
  ])(
    '$role 的导航按权限显示审计与用户入口',
    async ({ role, audit, users }) => {
      authMocks.fetchCurrentUser.mockResolvedValue(sessionUser(role));
      renderAppAt('/');

      await screen.findByText(
        '家族档案概况、待办事项与来源覆盖率。',
      );

      const auditItem = screen.queryByRole('menuitem', {
        name: /审计日志/,
      });
      const usersItem = screen.queryByRole('menuitem', {
        name: /用户管理/,
      });

      if (audit) {
        expect(auditItem).toBeInTheDocument();
      } else {
        expect(auditItem).not.toBeInTheDocument();
      }

      if (users) {
        expect(usersItem).toBeInTheDocument();
      } else {
        expect(usersItem).not.toBeInTheDocument();
      }
    },
  );

  it('编辑员直接访问审计页返回 403 且不发起请求', async () => {
    authMocks.fetchCurrentUser.mockResolvedValue(
      sessionUser('EDITOR'),
    );
    renderAppAt('/audit');

    expect(
      await screen.findByText('当前角色无权访问该页面。'),
    ).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(auditMocks.fetchAuditLogs).not.toHaveBeenCalled();
  });

  it('退出登录后回到登录页', async () => {
    authMocks.fetchCurrentUser.mockResolvedValue(sessionUser('ADMIN'));
    authMocks.logout.mockImplementation(async () => {
      authMocks.fetchCurrentUser.mockRejectedValue(unauthorizedError());
    });
    const view = renderAppAt('/');

    await screen.findByText(
      '家族档案概况、待办事项与来源覆盖率。',
    );
    fireEvent.click(screen.getByRole('button', { name: /退\s*出/ }));

    expect(
      await screen.findByText('登录 AI 家谱编辑系统'),
    ).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/login');
    expect(authMocks.logout).toHaveBeenCalledTimes(1);
    expect(authMocks.fetchCurrentUser).toHaveBeenCalled();
  });

  it('会话恢复失败时显示错误与重试入口', async () => {
    authMocks.fetchCurrentUser.mockRejectedValue(
      new Error('会话服务不可用'),
    );
    renderAppAt('/');

    expect(
      await screen.findByText('无法恢复登录状态'),
    ).toBeInTheDocument();
    expect(screen.getByText('会话服务不可用')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /重\s*试/ }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(authMocks.fetchCurrentUser).toHaveBeenCalledTimes(1);
    });
  });
});
