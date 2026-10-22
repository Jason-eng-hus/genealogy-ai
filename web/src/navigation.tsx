import {
  ApartmentOutlined,
  AuditOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HistoryOutlined,
  RobotOutlined,
  ShareAltOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  hasPermission,
  type Permission,
} from '@shared/constants/permissions.ts';
import type { Role } from '@shared/constants/enums.ts';
import type { ReactNode } from 'react';

export interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: ReactNode;
  permission?: Permission;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    label: '概览',
    items: [
      {
        path: '/',
        label: '仪表盘',
        description: '家族档案概况、待办事项与来源覆盖率。',
        icon: <DashboardOutlined />,
      },
    ],
  },
  {
    key: 'archive',
    label: '档案',
    items: [
      {
        path: '/persons',
        label: '人物',
        description: '人物档案的检索、筛选与分页浏览。',
        icon: <TeamOutlined />,
      },
      {
        path: '/tree',
        label: '家谱树',
        description: '祖先、后代与全谱视图，支持定位与分支展开。',
        icon: <ApartmentOutlined />,
      },
    ],
  },
  {
    key: 'intelligence',
    label: '智能处理',
    items: [
      {
        path: '/import/ai',
        label: 'AI 导入',
        description: '来源转写、脱敏预览、抽取任务与草稿审核。',
        icon: <RobotOutlined />,
      },
      {
        path: '/import/gedcom',
        label: 'GEDCOM 导入',
        description: 'GEDCOM 解析预览、姓氏映射与提交。',
        icon: <UploadOutlined />,
      },
      {
        path: '/narratives',
        label: '叙事',
        description: '事实包预览、逐句引用、人工确认与导出。',
        icon: <FileTextOutlined />,
      },
    ],
  },
  {
    key: 'quality',
    label: '质量与查询',
    items: [
      {
        path: '/checks',
        label: '校验中心',
        description: '一致性校验、问题处理与质量指标。',
        icon: <CheckSquareOutlined />,
      },
      {
        path: '/kinship',
        label: '亲缘查询',
        description: '亲缘路径、中文称谓与来源引用。',
        icon: <ShareAltOutlined />,
      },
    ],
  },
  {
    key: 'collaboration',
    label: '协作与审计',
    items: [
      {
        path: '/reviews',
        label: '审核中心',
        description: '审核请求、差异对比与审批记录。',
        icon: <AuditOutlined />,
      },
      {
        path: '/audit',
        label: '审计日志',
        description: '关键操作与快照变化查询。',
        icon: <HistoryOutlined />,
        permission: 'AUDIT_VIEW',
      },
    ],
  },
  {
    key: 'system',
    label: '系统',
    items: [
      {
        path: '/users',
        label: '用户管理',
        description: '账号、角色与密码管理。',
        icon: <UserOutlined />,
        permission: 'USER_MANAGE',
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(
  (group) => group.items,
);

export function visibleNavGroups(role: Role | undefined): NavGroup[] {
  if (role === undefined) {
    return [];
  }

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.permission === undefined ||
        hasPermission(role, item.permission),
    ),
  })).filter((group) => group.items.length > 0);
}

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') {
    return NAV_ITEMS.find((item) => item.path === '/');
  }

  if (pathname.startsWith('/persons/')) {
    return NAV_ITEMS.find((item) => item.path === '/persons');
  }

  return NAV_ITEMS.filter((item) => item.path !== '/').find(
    (item) =>
      pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
}

export function resolveNavKey(pathname: string): string {
  return findNavItem(pathname)?.path ?? '';
}

export function resolvePageTitle(pathname: string): string {
  if (pathname === '/login') {
    return '登录';
  }

  if (pathname.startsWith('/persons/')) {
    return '人物详情';
  }

  return findNavItem(pathname)?.label ?? '页面未找到';
}
