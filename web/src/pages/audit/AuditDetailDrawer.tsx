import {
  Alert,
  Collapse,
  Descriptions,
  Drawer,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
  AUDIT_ANONYMOUS_ACTOR_LABEL,
  auditActionLabel,
  auditEntityLabel,
} from '@shared/constants/audit.ts';
import { ROLE_LABELS } from '@shared/constants/permissions.ts';
import type { Role } from '@shared/constants/enums.ts';
import type { AuditLogItem } from '@shared/types/audit.ts';
import { AuditDiffTable } from './AuditDiffTable';

function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

function formatSnapshot(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  try {
    const serialized = JSON.stringify(value, null, 2);

    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

function SnapshotBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <Typography.Text type="secondary">无快照</Typography.Text>;
  }

  return <pre className="audit-snapshot">{formatSnapshot(value)}</pre>;
}

export interface AuditDetailDrawerProps {
  item: AuditLogItem | null;
  open: boolean;
  onClose: () => void;
}

export function AuditDetailDrawer({
  item,
  open,
  onClose,
}: AuditDetailDrawerProps) {
  return (
    <Drawer
      title="审计详情"
      width={640}
      open={open}
      destroyOnHidden
      onClose={onClose}
    >
      {item !== null && (
        <div className="audit-detail">
          {item.redacted && (
            <Alert
              className="audit-detail__alert"
              type="info"
              showIcon
              message="快照已遮罩"
              description="敏感字段（如 IP、User-Agent、密码哈希、令牌或服务器路径）已替换为 [已隐藏]。"
            />
          )}

          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              {
                key: 'createdAt',
                label: '时间',
                children: dayjs(item.createdAt).isValid()
                  ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')
                  : item.createdAt,
              },
              {
                key: 'action',
                label: '动作',
                children: (
                  <>
                    {auditActionLabel(item.action)}
                    <Typography.Text
                      type="secondary"
                      className="audit-detail__code"
                    >
                      {item.action}
                    </Typography.Text>
                  </>
                ),
              },
              {
                key: 'actor',
                label: '操作人',
                children:
                  item.actor === null ? (
                    AUDIT_ANONYMOUS_ACTOR_LABEL
                  ) : (
                    <>
                      {item.actor.displayName}
                      <Typography.Text
                        type="secondary"
                        className="audit-detail__code"
                      >
                        {item.actor.username}
                      </Typography.Text>
                    </>
                  ),
              },
              {
                key: 'actorRole',
                label: '操作时角色',
                children: roleLabel(item.actorRole),
              },
              {
                key: 'entity',
                label: '实体',
                children:
                  item.entityType === null ? (
                    '—'
                  ) : (
                    <>
                      {auditEntityLabel(item.entityType)}
                      {item.entityId !== null && (
                        <Typography.Text
                          type="secondary"
                          className="audit-detail__code"
                        >
                          {item.entityId}
                        </Typography.Text>
                      )}
                    </>
                  ),
              },
              {
                key: 'reason',
                label: '原因',
                children: item.reason === null ? '—' : item.reason,
              },
              {
                key: 'requestId',
                label: '请求 ID',
                children: item.requestId === null ? '—' : item.requestId,
              },
            ]}
          />

          <section className="audit-detail__section">
            <Typography.Title level={5} className="audit-detail__heading">
              字段差异
            </Typography.Title>
            <AuditDiffTable changes={item.changes} />
          </section>

          <section className="audit-detail__section">
            <Typography.Title level={5} className="audit-detail__heading">
              快照
            </Typography.Title>
            <Collapse
              className="audit-detail__snapshots"
              items={[
                {
                  key: 'before',
                  label: '变更前快照',
                  children: <SnapshotBlock value={item.before} />,
                },
                {
                  key: 'after',
                  label: '变更后快照',
                  children: <SnapshotBlock value={item.after} />,
                },
              ]}
            />
            <Typography.Paragraph
              type="secondary"
              className="audit-detail__footnote"
            >
              出于 L3 保密要求，IP 地址与 User-Agent 不在此展示。
            </Typography.Paragraph>
          </section>
        </div>
      )}
    </Drawer>
  );
}
