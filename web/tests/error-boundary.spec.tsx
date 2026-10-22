import { render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

function ThrowingChild(): never {
  throw new Error('测试异常');
}

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('无异常时正常渲染子组件', () => {
    render(
      <AppErrorBoundary>
        <div>内容正常</div>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('内容正常')).toBeInTheDocument();
  });

  it('子组件抛错时显示兜底页与重新加载按钮', () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '页面出现异常',
    );
    expect(
      screen.getByRole('button', { name: '重新加载' }),
    ).toBeInTheDocument();
  });
});
