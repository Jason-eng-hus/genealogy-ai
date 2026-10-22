import { Button, Result } from 'antd';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error.', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="app-error-boundary" role="alert">
          <Result
            status="error"
            title="页面出现异常"
            subTitle="界面在渲染时遇到问题。请重新加载；若问题持续，请查看服务端日志。"
            extra={
              <Button type="primary" onClick={this.handleReload}>
                重新加载
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
