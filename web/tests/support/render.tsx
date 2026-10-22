import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { render } from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { createQueryClient } from '@/api/queryClient';
import { routes } from '@/router';
import { appTheme } from '@/theme';

export function renderAppAt(path: string) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: {
      retry: false,
    },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
  });

  const result = render(
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>,
  );

  return {
    ...result,
    router,
    queryClient,
  };
}
