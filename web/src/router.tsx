import type { RouteObject } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth, RequirePermission } from './auth/guards';
import { AppLayout } from './components/AppLayout';
import { NAV_ITEMS } from './navigation';
import { AuditPage } from './pages/audit/AuditPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RouteErrorPage } from './pages/RouteErrorPage';

const PERSON_DETAIL_DESCRIPTION =
  '人物档案、亲属关系、事件与引用详情。';

const navRoutes: RouteObject[] = NAV_ITEMS.filter(
  (item) => item.path !== '/audit',
).map((item) =>
  item.path === '/'
    ? {
        index: true,
        element: (
          <PlaceholderPage
            title={item.label}
            description={item.description}
          />
        ),
      }
    : {
        path: item.path.slice(1),
        element: (
          <PlaceholderPage
            title={item.label}
            description={item.description}
          />
        ),
      },
);

export const routes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/login',
        element: (
          <div className="app-standalone">
            <LoginPage />
          </div>
        ),
        errorElement: <RouteErrorPage />,
      },
      {
        path: '/',
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        errorElement: <RouteErrorPage />,
        children: [
          ...navRoutes,
          {
            path: 'audit',
            element: (
              <RequirePermission permission="AUDIT_VIEW">
                <AuditPage />
              </RequirePermission>
            ),
          },
          {
            path: 'persons/:id',
            element: (
              <PlaceholderPage
                title="人物详情"
                description={PERSON_DETAIL_DESCRIPTION}
              />
            ),
          },
          {
            path: '*',
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
];
