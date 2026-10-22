# AI 家谱编辑系统 — 审计查询与可见性说明

| 项 | 内容 |
|---|---|
| 版本 | v1.0（2026-10-22，2.6.3 + 1.7.3） |
| 后端模块 | `server/src/modules/audit/`（`routes.ts`、`schemas.ts`、`service.ts`、`diff.ts`） |
| 共享定义 | `shared/src/constants/audit.ts`、`shared/src/types/audit.ts` |
| 前端页面 | `web/src/pages/audit/`、`web/src/pages/LoginPage.tsx`、`web/src/auth/` |
| 不可变性来源 | 迁移 `20261022064442_audit_append_only`（`AuditLog_no_update` / `AuditLog_no_delete`） |
| 相关文档 | `docs/migrations.md`、`docs/design-system.md`、Spec 2.6.3 / 2.13.5 / 2.14 |

本文件说明审计日志的查询契约、权限边界、L3 脱敏规则、只追加保证与页面交互，供实现、评审与答辩引用。审计写入仍由各业务端点在事务内调用 `server/src/services/audit.ts` 完成，本工作包只提供只读查询与展示。

## 1. 权限与入口

| 能力 | ADMIN | EDITOR | REVIEWER | VIEWER |
|---|---|---|---|---|
| `GET /api/v1/audit-logs` | ✓ | ✗ | ✓ | ✗ |
| 前端 `/audit` 页面 | ✓ | ✗（403，无菜单） | ✓ | ✗（403，无菜单） |
| 修改/删除审计 | ✗ | ✗ | ✗ | ✗ |
| JSON 导出（本期） | ✗ | ✗ | ✗ | ✗ |

- 后端路由先执行 `requireAuth`，再执行 `requirePermission('AUDIT_VIEW')`；未登录返回 `AUTH_REQUIRED`，无权限返回 `FORBIDDEN`（HTTP 403）。
- 前端导航项与路由守卫共用 `AUDIT_VIEW` 权限；非授权角色既不显示菜单，直接访问也会得到 403 结果页。
- 未登录访问 `/audit` 会跳转 `/login?redirect=%2Faudit`，登录成功后仅接受站内路径回跳。
- 审计读取是安全 GET：不要求 `X-Requested-With` / Origin 变更请求校验，也不会写入新的审计行。

## 2. 查询契约

### 2.1 请求

`GET /api/v1/audit-logs`

| 参数 | 类型与约束 | 默认 | 匹配方式 |
|---|---|---|---|
| `action` | `AUDIT_ACTIONS` 枚举值 | 全部 | 精确匹配 |
| `entityType` | `AUDIT_ENTITY_TYPES` 枚举值 | 全部 | 精确匹配 |
| `entityId` | 1–64 字符，首尾空白裁剪 | 全部 | 精确匹配 |
| `actor` | 1–64 字符，首尾空白裁剪 | 全部 | `username` 或 `displayName` 包含匹配 |
| `from` | ISO 8601 日期时间，必须带时区（`Z` 或 `±hh:mm`） | 不限 | `createdAt >= from`（含） |
| `to` | ISO 8601 日期时间，必须带时区 | 不限 | `createdAt <= to`（含） |
| `page` | 整数，≥ 1 | `1` | — |
| `pageSize` | 整数，1–100 | `20` | — |

- 查询对象为严格模式：出现未声明参数即返回 `VALIDATION_ERROR`（HTTP 400），并在 `details.issues` 中给出字段路径。
- `from > to` 返回 `VALIDATION_ERROR`，字段定位到 `from`。
- 时间语义为闭区间；页面把日期范围转换为当天 `00:00:00.000` 至 `23:59:59.999` 的本地时间再转 ISO。
- 排序固定为 `createdAt DESC, id DESC`，`skip/take` 分页；同一毫秒内的记录也保持稳定顺序。
- 列表与计数在同一个 `prisma.$transaction` 中执行，返回的总数与本页数据一致。

### 2.2 响应

统一信封：

```json
{
  "code": "OK",
  "message": "ok",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 20
  }
}
```

`items` 元素字段：

| 字段 | 说明 |
|---|---|
| `id` | 审计记录 ID |
| `createdAt` | ISO 8601 时间 |
| `action` | 动作枚举 |
| `actorRole` | 操作发生时的角色快照 |
| `actor` | `{ id, username, displayName }`；匿名事件为 `null` |
| `entityType` / `entityId` | 实体类型与 ID；不适用时为 `null` |
| `reason` | 操作原因/备注 |
| `requestId` | 关联请求 ID，用于排查 |
| `before` / `after` | 已脱敏的实体快照对象；无快照时为 `null` |
| `changes` | 服务端计算的字段差异列表 |
| `redacted` | 任一快照发生遮罩时为 `true` |

`changes` 元素：

| 字段 | 说明 |
|---|---|
| `path` | 扁平化字段路径，如 `birthYear`、`name.given`；空对象根节点为 `$` |
| `kind` | `ADDED` / `REMOVED` / `CHANGED` |
| `before` / `after` | 对应值；缺失侧为 `null` |

差异在脱敏之后计算：快照中命中的敏感值先替换为 `[已隐藏]`，两侧都遮罩为相同文本时不会产生差异。数组按下标作为路径层级，对象递归展开；值比较使用深度严格相等。

### 2.3 明确不提供的接口

- 不提供 `GET /audit-logs/:id` 详情端点；详情数据随列表一次返回。
- 不提供 `PATCH` / `PUT` / `DELETE` / 批量删除接口。
- 本期不提供 JSON 导出；页面与 API 均无导出入口。

## 3. L3 保密与脱敏

查询层使用显式 `select`，**不读取** `ip` 与 `userAgent` 两列，因此它们不会出现在任何响应中。返回的 `requestId` 用于关联应用日志，不包含客户端网络信息。

快照在返回前执行递归脱敏：

1. 字段名先移除空白、下划线与连字符并转小写，再与敏感名单比较；命中即整体替换为 `[已隐藏]`。
2. 敏感名单覆盖：`ip`、`userAgent`、`password`、`passwordHash`、`token`、`accessToken`、`refreshToken`、`jwt`、`secret`、`apiKey`、`authorization`、`cookie`、`setCookie`、`sessionToken`、`path`、`serverPath`、`filePath`、`storagePath`、`absolutePath`、`uploadDir`、`backupDir` 等。
3. 任意字符串值若形如 Windows 盘符路径、UNC 路径或 `/home`、`/Users`、`/var`、`/opt`、`/srv`、`/tmp`、`/etc`、`/root` 开头的服务器绝对路径，也替换为 `[已隐藏]`。
4. 数组与嵌套对象递归处理；`before` / `after` 任一发生替换时，`redacted=true`。

边界说明：脱敏基于敏感键名与绝对路径模式，而非内容分类器；新增快照字段若使用未覆盖的键名，需要在 `server/src/modules/audit/diff.ts` 补充名单并增加测试。密码哈希、JWT 密钥、AI API Key 从不进入审计快照，属于写入侧约束。

## 4. 只追加与不可变性

- 迁移 `20261022064442_audit_append_only` 创建两个 SQLite 触发器：
  - `AuditLog_no_update`：任何 `UPDATE` 抛出 `AUDIT_LOG_IMMUTABLE`；
  - `AuditLog_no_delete`：任何 `DELETE` 抛出 `AUDIT_LOG_IMMUTABLE`。
- 应用层只有 `create` 与只读查询，没有更新/删除审计的服务函数或路由。
- 验证由 `server/tests/audit-immutability.spec.ts` 覆盖：使用 Prisma 与原生 `DatabaseSync` 分别尝试修改/删除，均被数据库拒绝。
- 该迁移尚未应用到真实 `data/genealogy.db`；部署前必须备份并单独授权执行迁移。

## 5. 前端页面

### 5.1 `/audit`

- 页面顶部显示“只读”标签与 L3 说明，明确不提供修改/删除入口。
- 筛选区：动作、实体类型、实体 ID、操作人、时间范围；查询提交后页码回到第 1 页；重置清空全部条件。
- 列表列：时间、动作（失败动作使用红色标签，如“登录失败”）、操作人、实体、原因、变化数量与遮罩标记、操作。
- 分页使用服务端总数，可选 10/20/50/100 条/页；上一页/下一页与页码跳转均重新请求。
- 请求失败显示错误提示与“重试”按钮，保留当前筛选条件。
- 详情抽屉：
  - 顶部在 `redacted=true` 时显示“部分字段已隐藏”提示；
  - 摘要区展示动作、操作人、角色、实体、原因、请求 ID、时间；
  - 字段差异表展示字段、变化类型、变更前、变更后；无差异显示“无字段变化”；
  - 折叠面板展示变更前/后完整快照（JSON 格式化，纯文本渲染）；
  - 页脚注明 IP 地址与 User-Agent 因 L3 要求不展示。
- 权限说明抽屉：四角色可查矩阵、L3 强制遮罩、只追加、受控导出（本期未开放）、审核中心联动延后说明。
- 无数据时显示空态而不是空白表格；列表加载时保留上一页数据（`keepPreviousData`）。

### 5.2 最小认证桥接（临时）

1.1.2（完整登录/会话/守卫）尚未实现，本工作包提供最小桥接以便审计页面可用：

- `web/src/auth/session.ts`：`GET /auth/me` 恢复会话、`POST /auth/login` 登录、`POST /auth/logout` 登出；运行时校验用户载荷。
- `web/src/auth/AuthProvider.tsx`：TanStack Query 管理 `['auth','me']`；登录后清空非认证缓存；登出先清本地状态再通知服务端，服务端失败也不会停留在已登录界面。
- `web/src/auth/guards.tsx`：加载态、会话恢复失败重试、未登录跳转、403 结果页。
- `web/src/navigation.tsx`：菜单项声明所需权限，按角色过滤分组与条目。
- `web/src/pages/LoginPage.tsx`：独立登录卡片、错误提示、限流提示、已登录回跳、仅站内安全回跳。

该桥接只覆盖本阶段所需能力；1.1.2 实现时应替换或扩展它，而不是并行维护两套会话逻辑。

## 6. 已知限制与后续工作

| 项 | 现状 | 后续归属 |
|---|---|---|
| 完整登录/改密/会话管理 | 仅最小登录、会话恢复、登出 | 1.1.2 |
| 角色可见性矩阵与响应过滤 | 审计页说明为静态文案；实体接口尚未统一接入 | 2.7.2 |
| 审核中心差异联动 | 不提供跳转链接 | 1.7.1 / 1.7.2 |
| JSON 导出 | 未开放 | 由负责人另行授权 |
| 审计详情端点 | 不提供，详情随列表返回 | 按需评审 |
| 读取行为审计 | 查询不写审计 | 默认策略，如需变更先更新 Spec |
| 索引与触发器部署 | 迁移已提交，真实库未应用 | 备份后单独授权 |
| 脱敏覆盖 | 键名/路径规则，非内容分类 | 新增字段时同步名单与测试 |

## 7. 验证

```bash
# 审计后端（查询、差异、不可变性）
npx vitest run --config vitest.config.ts \
  server/tests/audit-query.spec.ts \
  server/tests/audit-diff.spec.ts \
  server/tests/audit-immutability.spec.ts

# 审计前端与认证桥接
npx vitest run --config web/vitest.config.ts \
  web/tests/audit-api.spec.ts \
  web/tests/audit-page.spec.tsx \
  web/tests/auth-guard.spec.tsx

# 全量类型、测试与构建
npm run typecheck
npm test
npm run build
```

浏览器验证使用临时库（`server/prisma/.tmp/audit-ui.db`）与临时种子脚本，覆盖四个角色：ADMIN 可筛选/查看详情与遮罩快照；REVIEWER 可查看审计但无用户管理入口；EDITOR 与 VIEWER 访问 `/audit` 均为 403 且无菜单入口。验证完成后临时库、种子脚本与进程已清理，真实 `data/genealogy.db` 未改动。
