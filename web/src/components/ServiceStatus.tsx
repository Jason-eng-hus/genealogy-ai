import { useQuery } from '@tanstack/react-query';
import { Badge } from 'antd';
import { fetchHealth } from '../api/health';

export function ServiceStatus() {
  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: 1,
  });

  if (healthQuery.isPending) {
    return <Badge status="processing" text="服务检测中" />;
  }

  if (healthQuery.isError) {
    const message =
      healthQuery.error instanceof Error
        ? healthQuery.error.message
        : '无法连接服务。';

    return (
      <span title={message}>
        <Badge status="error" text="服务不可用" />
      </span>
    );
  }

  const health = healthQuery.data;

  if (health.status === 'degraded' || health.database.status === 'error') {
    return (
      <span title={`版本 ${health.version} · 数据库不可用`}>
        <Badge status="warning" text="数据库异常" />
      </span>
    );
  }

  const latencyText =
    health.database.latencyMs === undefined
      ? ''
      : ` · ${health.database.latencyMs} ms`;

  return (
    <span title={`版本 ${health.version} · 数据库正常${latencyText}`}>
      <Badge status="success" text="服务正常" />
    </span>
  );
}
