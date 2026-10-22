import {
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Space,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  AUDIT_ANONYMOUS_ACTOR_LABEL,
  AUDIT_FAILURE_ACTIONS,
  AUDIT_PAGE_SIZE_DEFAULT,
  AUDIT_PAGE_SIZE_OPTIONS,
  auditActionLabel,
  auditEntityLabel,
} from '@shared/constants/audit.ts';
import {
  ROLE_LABELS,
} from '@shared/constants/permissions.ts';
import type { Role } from '@shared/constants/enums.ts';
import type {
  AuditLogItem,
  AuditLogQuery,
} from '@shared/types/audit.ts';
import { fetchAuditLogs } from '@/api/audit';
import {
  AuditFilters,
  type AuditFilterValues,
} from './AuditFilters';
import { AuditDetailDrawer } from './AuditDetailDrawer';
import { AuditPermissionDrawer } from './AuditPermissionDrawer';

function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

function formatTimestamp(value: string): string {
  const parsed = dayjs(value);

  return parsed.isValid()
    ? parsed.format('YYYY-MM-DD HH:mm:ss')
    : value;
}

function isFailureAction(action: string): boolean {
  return AUDIT_FAILURE_ACTIONS.includes(
    action as (typeof AUDIT_FAILURE_ACTIONS)[number],
  );
}

export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilterValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(AUDIT_PAGE_SIZE_DEFAULT);
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  const [permissionOpen, setPermissionOpen] = useState(false);

  const query = useQuery({
    queryKey: ['audit-logs', filters, page, pageSize],
    queryFn: () =>
      fetchAuditLogs({
        ...filters,
        page,
        pageSize,
      } satisfies AuditLogQuery),
    placeholderData: keepPreviousData,
  });

  const handleSearch = (next: AuditFilterValues): void => {
    setFilters(next);
    setPage(1);
  };

  const handleReset = (): void => {
    setFilters({});
    setPage(1);
  };

  const handlePageChange = (
    nextPage: number,
    nextPageSize: number,
  ): void => {
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize);
      setPage(1);
      return;
    }

    setPage(nextPage);
  };

  const columns: TableColumnsType<AuditLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => (
        <Typography.Text className="audit-table__time">
          {formatTimestamp(value)}
        </Typography.Text>
      ),
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 150,
      render: (action: string) => (
        <div className="audit-table__action">
          <Tag color={isFailureAction(action) ? 'red' : 'blue'}>
            {auditActionLabel(action)}
          </Tag>
          <Typography.Text type="secondary" className="audit-table__code">
            {action}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '操作人',
      dataIndex: 'actor',
      width: 170,
      render: (_value: unknown, record) => (
        <div className="audit-table__actor">
          <Typography.Text>
            {record.actor?.displayName ?? AUDIT_ANONYMOUS_ACTOR_LABEL}
          </Typography.Text>
          <Typography.Text type="secondary" className="audit-table__code">
            {record.actor !== null
              ? `${record.actor.username} · ${roleLabel(record.actorRole)}`
              : roleLabel(record.actorRole)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '实体',
      dataIndex: 'entityType',
      width: 170,
      render: (_value: unknown, record) => {
        if (record.entityType === null) {
          return '—';
        }

        return (
          <div className="audit-table__entity">
            <Typography.Text>
              {auditEntityLabel(record.entityType)}
            </Typography.Text>
            {record.entityId !== null && (
              <Typography.Text
                type="secondary"
                className="audit-table__code"
                ellipsis={{ tooltip: record.entityId }}
              >
                {record.entityId}
              </Typography.Text>
            )}
          </div>
        );
      },
    },
    {
      title: '原因',
      dataIndex: 'reason',
      render: (reason: string | null) =>
        reason === null || reason === '' ? (
          '—'
        ) : (
          <Typography.Text
            className="audit-table__reason"
            ellipsis={{ tooltip: reason }}
          >
            {reason}
          </Typography.Text>
        ),
    },
    {
      title: '变化',
      dataIndex: 'changes',
      width: 130,
      render: (_value: unknown, record) => (
        <Space size={4} wrap>
          {record.changes.length > 0 ? (
            <Tag color="geekblue">{record.changes.length} 项</Tag>
          ) : (
            <Typography.Text type="secondary">无变化</Typography.Text>
          )}
          {record.redacted && <Tag color="orange">已遮罩</Tag>}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'detail',
      width: 90,
      fixed: 'right',
      render: (_value: unknown, record) => (
        <Button type="link" size="small" onClick={() => setDetail(record)}>
          详情
        </Button>
      ),
    },
  ];

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const isLoading = query.isLoading;
  const errorMessage =
    query.error instanceof Error
      ? query.error.message
      : '审计日志加载失败，请稍后重试。';

  return (
    <div className="audit-page">
      <Card
        className="audit-card"
        title={
          <Space wrap>
            <span>审计日志</span>
            <Tag>只读</Tag>
          </Space>
        }
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              刷新
            </Button>
            <Button
              icon={<SafetyCertificateOutlined />}
              onClick={() => setPermissionOpen(true)}
            >
              权限与遮罩说明
            </Button>
          </Space>
        }
      >
        <Alert
          className="audit-notice"
          type="info"
          showIcon
          message="审计日志为只追加记录，系统不提供修改或删除入口。"
          description="出于 L3 保密要求，IP 地址、User-Agent、密码哈希、令牌与服务器绝对路径不会返回前端；快照中的敏感字段以 [已隐藏] 替代。"
        />
        <AuditFilters
          loading={query.isFetching}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      </Card>

      <Card className="audit-table-card">
        {query.error !== null && (
          <Alert
            className="audit-table__alert"
            type="error"
            showIcon
            message="审计日志加载失败"
            description={errorMessage}
            action={
              <Button
                size="small"
                onClick={() => void query.refetch()}
              >
                重试
              </Button>
            }
          />
        )}
        <Typography.Paragraph type="secondary" className="audit-table__summary">
          共 {total} 条记录
          {query.isFetching && !query.isLoading ? ' · 正在更新…' : ''}
        </Typography.Paragraph>
        <Table<AuditLogItem>
          rowKey="id"
          size="middle"
          tableLayout="fixed"
          scroll={{ x: 1080 }}
          columns={columns}
          dataSource={items}
          loading={isLoading}
          locale={{
            emptyText: isLoading ? '正在加载…' : '暂无审计记录',
          }}
          pagination={{
            current: query.data?.page ?? page,
            pageSize: query.data?.pageSize ?? pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: AUDIT_PAGE_SIZE_OPTIONS.map(String),
            showTotal: (count, range) =>
              count === 0
                ? '共 0 条'
                : `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`,
            onChange: handlePageChange,
          }}
        />
      </Card>

      <AuditDetailDrawer
        item={detail}
        open={detail !== null}
        onClose={() => setDetail(null)}
      />
      <AuditPermissionDrawer
        open={permissionOpen}
        onClose={() => setPermissionOpen(false)}
      />
    </div>
  );
}
