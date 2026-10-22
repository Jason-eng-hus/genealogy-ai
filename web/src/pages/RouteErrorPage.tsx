import { Button, Result } from 'antd';
import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';

export function RouteErrorPage() {
  const error = useRouteError();

  useEffect(() => {
    console.error('Route rendering failed.', error);
  }, [error]);

  return (
    <Result
      status="error"
      title="页面加载失败"
      subTitle="页面在加载时遇到问题。请重新加载；若问题持续，请查看服务端日志。"
      extra={
        <Button type="primary" onClick={() => window.location.reload()}>
          重新加载
        </Button>
      }
    />
  );
}
