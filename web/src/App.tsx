import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { queryClient } from './api/queryClient';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { routes } from './router';
import { appTheme } from './theme';

const router = createBrowserRouter(routes);

export function App() {
  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <AppErrorBoundary>
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
          </AppErrorBoundary>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
