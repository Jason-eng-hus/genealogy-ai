import { Button, Result, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  hasPermission,
  type Permission,
} from '@shared/constants/permissions.ts';
import { useAuth } from './AuthProvider';

function SessionLoading() {
  return (
    <div className="app-route-state">
      <Spin size="large" />
      <Typography.Text type="secondary">正在恢复会话…</Typography.Text>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, error, refresh } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <SessionLoading />;
  }

  if (error !== null) {
    return (
      <div className="app-route-state">
        <Result
          status="error"
          title="无法恢复登录状态"
          subTitle={error.message}
          extra={<Button onClick={refresh}>重试</Button>}
        />
      </div>
    );
  }

  if (user === null) {
    const redirect = `${location.pathname}${location.search}`;

    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        replace
      />
    );
  }

  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { user } = useAuth();

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  if (!hasPermission(user.role, permission)) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}

export function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <Result
      status="403"
      title="403"
      subTitle="当前角色无权访问该页面。"
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          返回仪表盘
        </Button>
      }
    />
  );
}
