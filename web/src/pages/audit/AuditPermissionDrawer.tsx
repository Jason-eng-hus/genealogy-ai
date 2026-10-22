import {
  Alert,
  Drawer,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import {
  ROLE_LABELS,
} from '@shared/constants/permissions.ts';
import type { Role } from '@shared/constants/enums.ts';

interface PermissionRow {
  key: Role;
  role: string;
  canView: boolean;
  masking: string;
  exportPolicy: string;
}

const ROWS: PermissionRow[] = [
  {
    key: 'ADMIN',
    role: ROLE_LABELS.ADMIN,
    canView: true,
    masking: '强制遮罩 L3 敏感字段',
    exportPolicy: '仅受控导出（本期未开放）',
  },
  {
    key: 'REVIEWER',
    role: ROLE_LABELS.REVIEWER,
    canView: true,
    masking: '强制遮罩 L3 敏感字段',
    exportPolicy: '仅受控导出（本期未开放）',
  },
  {
    key: 'EDITOR',
    role: ROLE_LABELS.EDITOR,
    canView: false,
    masking: '不适用',
    exportPolicy: '不适用',
  },
  {
    key: 'VIEWER',
    role: ROLE_LABELS.VIEWER,
    canView: false,
    masking: '不适用',
    exportPolicy: '不适用',
  },
];

const columns: TableColumnsType<PermissionRow> = [
  {
    title: '角色',
    dataIndex: 'role',
    width: 90,
  },
  {
    title: '审计查询',
    dataIndex: 'canView',
    width: 110,
    render: (canView: boolean) =>
      canView ? (
        <Tag color="green">可查看</Tag>
      ) : (
        <Tag color="red">不可查看</Tag>
      ),
  },
  {
    title: '敏感字段',
    dataIndex: 'masking',
  },
  {
    title: '导出与分享',
    dataIndex: 'exportPolicy',
  },
];

export interface AuditPermissionDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AuditPermissionDrawer({
  open,
  onClose,
}: AuditPermissionDrawerProps) {
  return (
    <Drawer
      title="权限与遮罩说明"
      width={560}
      open={open}
      destroyOnHidden
      onClose={onClose}
    >
      <div className="audit-permission">
        <Alert
          type="info"
          showIcon
          message="审计查询仅对管理员与审核员开放"
          description="编辑员与访客不显示审计入口；直接访问受限页面会返回 403。审计查询为只读操作，不会写入新的审计记录。"
        />

        <Table<PermissionRow>
          className="audit-permission__table"
          size="small"
          rowKey="key"
          pagination={false}
          columns={columns}
          dataSource={ROWS}
        />

        <section className="audit-permission__section">
          <Typography.Title level={5}>遮罩规则</Typography.Title>
          <ul className="audit-permission__list">
            <li>
              IP 地址、User-Agent、密码哈希、令牌、Cookie 与服务器绝对路径属于
              L3 保密数据，查询接口不会返回这些字段。
            </li>
            <li>
              快照中命中敏感键名或路径形态的值会替换为
              <Typography.Text code>[已隐藏]</Typography.Text>
              ，并标记该条记录为“已遮罩”。
            </li>
            <li>
              操作人仅展示显示名与用户名；登录失败等匿名事件显示为“匿名”。
            </li>
          </ul>
        </section>

        <section className="audit-permission__section">
          <Typography.Title level={5}>只追加与导出</Typography.Title>
          <ul className="audit-permission__list">
            <li>
              审计日志由数据库触发器保证只追加，页面不提供修改或删除入口。
            </li>
            <li>
              本期不提供 JSON 导出、批量导出或对外分享入口；后续导出须遵循受控导出策略并记录审计。
            </li>
            <li>
              与审核中心、审核请求详情的联动将在后续工作包接入。
            </li>
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
