import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import {
  Button,
  Layout,
  Menu,
  Tag,
  Typography,
  type MenuProps,
} from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@shared/constants/permissions.ts';
import { useAuth } from '../auth/AuthProvider';
import { APP_TITLE } from '../config';
import {
  resolveNavKey,
  resolvePageTitle,
  visibleNavGroups,
} from '../navigation';
import { designTokens } from '../theme/tokens';
import { ServiceStatus } from './ServiceStatus';

const { Header, Sider, Content, Footer } = Layout;

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const selectedKey = resolveNavKey(location.pathname);
  const pageTitle = resolvePageTitle(location.pathname);

  const menuItems = useMemo<MenuProps['items']>(
    () =>
      visibleNavGroups(user?.role).map((group) => ({
        type: 'group' as const,
        key: group.key,
        label: group.label,
        children: group.items.map((item) => ({
          key: item.path,
          icon: <span aria-hidden="true">{item.icon}</span>,
          label: item.label,
        })),
      })),
    [user?.role],
  );

  const handleSignOut = async (): Promise<void> => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);

    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Layout className="app-shell">
      <Sider
        className="app-sider"
        width={designTokens.siderWidth}
        collapsedWidth={designTokens.siderCollapsedWidth}
        collapsible
        collapsed={collapsed}
        trigger={null}
      >
        <div
          className={`app-brand${collapsed ? ' app-brand--collapsed' : ''}`}
        >
          <span className="app-brand__seal" aria-hidden="true">
            谱
          </span>
          {!collapsed && (
            <div className="app-brand__text">
              <span className="app-brand__title">{APP_TITLE}</span>
              <span className="app-brand__subtitle">
                族谱数字化与一致性校验
              </span>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          items={menuItems}
          selectedKeys={selectedKey === '' ? [] : [selectedKey]}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header__left">
            <Button
              type="text"
              aria-label={collapsed ? '展开导航' : '收起导航'}
              icon={
                collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
              }
              onClick={() => setCollapsed((value) => !value)}
            />
            <Typography.Title level={4} className="app-header__title">
              {pageTitle}
            </Typography.Title>
          </div>
          <div className="app-header__right">
            <ServiceStatus />
            {user !== null && (
              <div className="app-header__user">
                <span className="app-header__user-name">
                  {user.displayName}
                </span>
                <Tag className="app-header__role">
                  {ROLE_LABELS[user.role]}
                </Tag>
                <Button
                  type="text"
                  size="small"
                  loading={signingOut}
                  onClick={() => void handleSignOut()}
                >
                  退出
                </Button>
              </div>
            )}
          </div>
        </Header>
        <Content className="app-content">
          <div className="app-content__inner">
            <Outlet />
          </div>
        </Content>
        <Footer className="app-footer">
          {APP_TITLE} · 本地单机版 · 数据仅用于家族内部整理
        </Footer>
      </Layout>
    </Layout>
  );
}
