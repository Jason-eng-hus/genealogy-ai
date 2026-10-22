import { Empty, Table, Tag, Typography } from 'antd';
import type {
  AuditChange,
  AuditChangeKind,
} from '@shared/types/audit.ts';

const KIND_LABELS: Record<AuditChangeKind, string> = {
  ADDED: '新增',
  REMOVED: '删除',
  CHANGED: '修改',
};

const KIND_COLORS: Record<AuditChangeKind, string> = {
  ADDED: 'green',
  REMOVED: 'red',
  CHANGED: 'gold',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    return value === '' ? '—' : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

export function AuditDiffTable({ changes }: { changes: AuditChange[] }) {
  if (changes.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="无字段变化"
      />
    );
  }

  return (
    <Table<AuditChange>
      size="small"
      rowKey="path"
      pagination={false}
      dataSource={changes}
      columns={[
        {
          title: '字段',
          dataIndex: 'path',
          width: 180,
          render: (path: string) => (
            <Typography.Text code>{path}</Typography.Text>
          ),
        },
        {
          title: '变化',
          dataIndex: 'kind',
          width: 80,
          render: (kind: AuditChangeKind) => (
            <Tag color={KIND_COLORS[kind]}>{KIND_LABELS[kind]}</Tag>
          ),
        },
        {
          title: '变更前',
          dataIndex: 'before',
          render: (value: unknown) => (
            <span className="audit-diff__value">{formatValue(value)}</span>
          ),
        },
        {
          title: '变更后',
          dataIndex: 'after',
          render: (value: unknown) => (
            <span className="audit-diff__value">{formatValue(value)}</span>
          ),
        },
      ]}
    />
  );
}
