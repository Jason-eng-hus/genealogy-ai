# AI 家谱编辑系统 — 数据字典

| 项目 | 内容 |
|---|---|
| 文档版本 | 1.0（2026-10-21） |
| 对应 Spec | `specs/ai-genealogy-spec.md` v1.0（校订 R2） |
| 对应 schema | `server/prisma/schema.prisma` |
| 对应迁移 | `server/prisma/migrations/20261021093501_init` |
| 工作包 | 3.1.3 ER 图、数据字典与模型评审记录 |
| 文档状态 | 已完成，待审阅 |

> 本字典逐字段描述 15 个模型，覆盖类型、必填、默认值、敏感级别、约束与索引。实体关系、外键、索引清单和模型评审记录见 `docs/er.md`；自动化一致性检查见第 8 章。

## 1 使用说明

1. **字段来源**：字段名、类型、必填与默认值以 `server/prisma/schema.prisma` 为准；本字典不得自行扩展字段。
2. **必填**：Prisma 类型不以 `?` 结尾即为必填；“必填”列与类型中的问号必须一致，由测试自动校验。
3. **默认值**：`cuid()`、`now()`、`@updatedAt` 为 Prisma 生成；`—` 表示无数据库默认值，由服务层写入。
4. **枚举**：字符串字段的允许值见第 4 章；数据库不建原生枚举，服务层与 zod 必须校验。
5. **JSON 字段**：所有以 `Json` 结尾的字段在 SQLite 中为 TEXT，存储 JSON 字符串；读取时必须处理解析失败。
6. **关系导航字段**：Prisma 的反向关系（如 `User.auditLogs`）不是数据库列，不在字段表中逐行列出；物理外键见 `docs/er.md` 3.1 节。
7. **时间**：所有 `DateTime` 字段以 UTC 存储，接口返回 ISO 8601；`updatedAt` 由 Prisma 自动维护。

## 2 类型映射

| Prisma 类型 | SQLite 存储 | 说明 |
|---|---|---|
| `String` | TEXT | ID、枚举字符串、普通文本、JSON 字符串 |
| `Int` | INTEGER | 年份、月份、日期、代数、版本、文件大小 |
| `Float` | REAL | 置信度（0–1） |
| `Boolean` | INTEGER（0/1） | Prisma 自动转换 |
| `DateTime` | DATETIME/TEXT | UTC；由 Prisma 读写 |

约束映射：

- 主键：`String @id @default(cuid())`，应用生成、非自增。
- 唯一约束：`@unique` 或 `@@unique`，由数据库强制。
- 外键：由 SQLite `PRAGMA foreign_keys=ON` 强制（3.2.1 启动时设置）。
- 软删除：`Person.status` + `Person.deletedAt`，无数据库级默认过滤；所有查询必须带默认过滤条件。
- 枚举/JSON 值域、跨字段约束、状态转换：数据库不强制，由服务层与测试保证（见第 7 章）。

## 3 敏感级别与标注规则

### 3.1 级别定义

| 级别 | 定义 | 典型内容 | 处理要求 |
|---|---|---|---|
| L0 公开 | 已故者公开事实或无数值含义的结构标识 | 已故者姓名、性别、世代、支系、生卒年份、亲缘结构 | 可对 VIEWER 展示；导出仍执行统一遮罩策略 |
| L1 家族 | 已故者明细与家族内部元数据 | 精确日期、地点、传记、事件、来源、引文、结构/版本/时间戳 | 仅登录且授权角色可见；VIEWER 对已故者可看 L0+L1，但在世者不返回 |
| L2 私有 | 在世者私有数据与账号/审核内容 | 在世者姓名、精确日期、地点、照片、传记、联系方式、用户显示名、AI 草稿、审核差异、叙事内容 | 默认不返回给 VIEWER；导出强制遮罩；调用第三方 AI 前脱敏 |
| L3 机密 | 凭证、密钥、路径、审计网络信息、脱敏映射 | 密码哈希、JWT 密钥、AI API Key、出站替换映射、审计 IP/UA、服务器存储路径 | 不进入任何前端响应；不写普通日志；不进入导出 |

### 3.2 条件级别标注

- `L0/L2`：已故者为 L0，在世者（含 `UNKNOWN` 按在世处理）为 L2。VIEWER 看已故者完整值，看在世者按遮罩规则处理（姓名保留首字，日期仅年份）。
- `L1/L2`：已故者为 L1，在世者为 L2。VIEWER 不返回在世者的该字段；已故者按 L1 返回（引文中的联系方式仍需正则脱敏）。
- `L1`：与在世状态无关的家族内部元数据，例如主键、外键、版本、状态、索引字段、审计动作。
- `L2`：仅与在世者/账号/审核内容相关的数据，例如 `livingStatus`、用户显示名、叙事正文。
- `L3`：机密字段，任何角色都不通过通用序列化返回；仅特定服务内部使用。

### 3.3 字段标注约定

1. 每个字段必须标注一个级别或一个条件级别；不允许空白或“待定”。
2. 条件级别以“最高适用级别”为准：只要字段可能包含在世者数据，就不能只标 L0/L1。
3. 主键/外键本身标 L1；其指向实体的内容敏感级别由被引用实体决定。
4. 审计快照 `beforeJson/afterJson` 可能包含 L2 数据，统一标 L2；`ip/userAgent` 标 L3。
5. 无死亡事实的人物默认 LIVING；死亡事实存在但未确认时仍按默认规则处理，字段敏感级别不因单条记录自动降级。

## 4 枚举常量字典

> 常量定义位于 `shared/src/constants/enums.ts`。下表的允许值与代码完全一致；任何新增/删除值都必须先更新 Spec 与常量，再评估迁移。

| 常量组 | 允许值 | 使用字段 |
|---|---|---|
| `ROLES` | `ADMIN`、`EDITOR`、`REVIEWER`、`VIEWER` | `User.role` |
| `GENDERS` | `MALE`、`FEMALE`、`OTHER`、`UNKNOWN` | `Person.gender` |
| `LIVING_STATUSES` | `LIVING`、`DECEASED`、`UNKNOWN` | `Person.livingStatus` |
| `PERSON_STATUSES` | `ACTIVE`、`MERGED`、`DELETED` | `Person.status` |
| `RELATION_TYPES` | `PARENT_CHILD`、`SPOUSE` | `Relation.type` |
| `PARENT_ROLES` | `FATHER`、`MOTHER`、`UNKNOWN` | `Relation.parentRole` |
| `CHILD_KINDS` | `BIOLOGICAL`、`ADOPTED`、`STEP`、`FOSTER`、`UNKNOWN` | `Relation.childKind` |
| `SPOUSE_KINDS` | `MARRIED`、`PARTNER`、`UNKNOWN` | `Relation.spouseKind` |
| `CERTAINTIES` | `CERTAIN`、`PROBABLE`、`DISPUTED` | `Relation.certainty`、`Event.certainty` |
| `EVENT_TYPES` | `BIRTH`、`DEATH`、`MARRIAGE`、`DIVORCE`、`OTHER` | `Event.type` |
| `SOURCE_TYPES` | `IMAGE`、`TEXT`、`ORAL`、`BOOK`、`TOMBSTONE`、`GEDCOM` | `Source.type` |
| `TRANSCRIPTION_STATUSES` | `PENDING`、`IN_PROGRESS`、`COMPLETED`、`FAILED` | `Source.transcriptionStatus` |
| `PRECISIONS` | `YEAR`、`MONTH`、`DAY`、`UNKNOWN` | `Person.birthPrecision`、`Person.deathPrecision`、`Event.precision` |
| `CALENDARS` | `SOLAR`、`LUNAR`、`UNKNOWN` | `Person.birthCalendar`、`Person.deathCalendar`、`Event.calendar` |
| `CITATION_TARGET_TYPES` | `PERSON`、`RELATION`、`EVENT` | `Citation.targetType` |
| `AI_JOB_KINDS` | `EXTRACT`、`NARRATIVE`、`KINSHIP_INTENT` | `AiJob.kind` |
| `AI_JOB_STATUSES` | `PENDING`、`RUNNING`、`SUCCEEDED`、`FAILED` | `AiJob.status` |
| `AI_PROVIDERS` | `openai-compatible`、`mock` | `AiJob.provider` |
| `DRAFT_TYPES` | `PERSON`、`RELATION`、`EVENT` | `AiDraft.draftType` |
| `DRAFT_STATUSES` | `PENDING`、`ACCEPTED`、`REJECTED` | `AiDraft.status` |
| `NARRATIVE_STATUSES` | `DRAFT`、`CONFIRMED` | `Narrative.status` |
| `ISSUE_SEVERITIES` | `ERROR`、`WARNING`、`INFO` | `ConsistencyIssue.severity` |
| `ISSUE_STATUSES` | `OPEN`、`IGNORED`、`RESOLVED` | `ConsistencyIssue.status` |
| `REVIEW_ACTIONS` | `MERGE_PERSON`、`DELETE_PERSON`、`DELETE_RELATION` | `ReviewRequest.action` |
| `REVIEW_STATUSES` | `PENDING`、`APPROVED`、`REJECTED`、`CANCELLED` | `ReviewRequest.status` |
| `GEDCOM_IMPORT_STATUSES` | `PARSED`、`PREVIEWED`、`COMMITTED`、`FAILED`、`CANCELLED` | `GedcomImport.status` |

## 5 模型字段字典

### 5.1 User（用户账号）

- 作用：本地账号、角色与登录状态；不删除账号，只禁用。
- 关系导航：`auditLogs`、`reviewsRequested`、`reviewsDecided`、`narrativesCreated`、`narrativesConfirmed`、`draftsReviewed`、`gedcomImports`（非数据库列）。
- 业务约束：密码只存 bcrypt 哈希（cost=12）；`role` 决定 RBAC；`isActive=false` 后会话立即失效。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `username` | `String` | 是 | — | L2 | 唯一；登录名；长度/字符集由 2.1.1 zod 约束 |
| `passwordHash` | `String` | 是 | — | L3 | bcrypt cost=12；禁止出现在 API、日志、导出 |
| `displayName` | `String` | 是 | — | L2 | 界面显示名 |
| `role` | `String` | 是 | `"VIEWER"` | L1 | 取值 `ROLES`；ADMIN/EDITOR/REVIEWER/VIEWER |
| `isActive` | `Boolean` | 是 | `true` | L1 | false=禁用；禁用后立即拒绝会话 |
| `lastLoginAt` | `DateTime?` | 否 | — | L2 | 最近成功登录时间 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.2 Family（家族）

- 作用：MVP 的家族作用域，种子数据只有一行。
- 关系导航：`persons`（非数据库列）。
- 业务约束：MVP 不支持多家族切换；有 Person 时禁止删除（`Person.family` 为 Restrict）。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `name` | `String` | 是 | — | L1 | 家族名 |
| `description` | `String?` | 否 | — | L1 | 家族简介 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.3 Person（人物）

- 作用：家谱核心实体；保存姓名、性别、在世状态、生卒部分日期、地点、传记、世代/支系、软删除与版本。
- 关系导航：`family`、`mergedInto`、`mergedFrom`、`relationsAsA`、`relationsAsB`、`events`、`narratives`（非数据库列）。
- 业务约束：未填死亡事实默认 LIVING；部分日期不伪造月日；`version` 每次成功修改 +1；MERGED/DELETED 默认查询过滤；合并来源人物置 MERGED 并指向保留者。
- 部分日期约束：`birthMonth` 需要 `birthYear`；`birthDay` 需要 `birthYear+birthMonth`；精度与字段一致；闰年/大小月由 3.1.2 校验；不得用 1 月 1 日填充缺失月日。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `familyId` | `String` | 是 | — | L1 | 外键 → Family.id；Restrict |
| `surname` | `String` | 是 | — | L0/L2 | 姓；在世 VIEWER 遮罩保留首字 |
| `givenName` | `String` | 是 | — | L0/L2 | 名；在世 VIEWER 遮罩 |
| `courtesyName` | `String?` | 否 | — | L0/L2 | 字号；遮罩策略同名 |
| `alias` | `String?` | 否 | — | L0/L2 | 别名/又名；参与检索 |
| `gender` | `String` | 是 | `"UNKNOWN"` | L0/L2 | 取值 `GENDERS` |
| `livingStatus` | `String` | 是 | `"LIVING"` | L2 | 取值 `LIVING_STATUSES`；UNKNOWN 按在世遮罩 |
| `birthYear` | `Int?` | 否 | — | L0/L2 | 出生年；无年时为空，不推测 |
| `birthMonth` | `Int?` | 否 | — | L1/L2 | 出生月；需要出生年 |
| `birthDay` | `Int?` | 否 | — | L1/L2 | 出生日；需要出生年+月 |
| `birthDateText` | `String?` | 否 | — | L1/L2 | 日期原文（如“光绪二十八年”）；展示优先 |
| `birthPrecision` | `String` | 是 | `"UNKNOWN"` | L1/L2 | 取值 `PRECISIONS`；与年/月/日一致 |
| `birthApproximate` | `Boolean` | 是 | `false` | L1/L2 | 约值/ABT/BEF/AFT；违规降级 ERROR→WARNING |
| `birthCalendar` | `String` | 是 | `"UNKNOWN"` | L1/L2 | 取值 `CALENDARS`；不做历法换算 |
| `birthPlace` | `String?` | 否 | — | L1/L2 | 出生地；在世 VIEWER 截断到省市/县 |
| `deathYear` | `Int?` | 否 | — | L0 | 死亡年；不得仅凭年龄推断死亡 |
| `deathMonth` | `Int?` | 否 | — | L1 | 死亡月；需要死亡年 |
| `deathDay` | `Int?` | 否 | — | L1 | 死亡日；需要死亡年+月 |
| `deathDateText` | `String?` | 否 | — | L1 | 死亡日期原文 |
| `deathPrecision` | `String` | 是 | `"UNKNOWN"` | L1 | 取值 `PRECISIONS` |
| `deathApproximate` | `Boolean` | 是 | `false` | L1 | 约值标记 |
| `deathCalendar` | `String` | 是 | `"UNKNOWN"` | L1 | 取值 `CALENDARS` |
| `deathPlace` | `String?` | 否 | — | L1 | 死亡地 |
| `occupation` | `String?` | 否 | — | L1/L2 | 职业；在世者不返回给 VIEWER |
| `biography` | `String?` | 否 | — | L1/L2 | 传记；在世者不返回；已故者联系方式正则脱敏 |
| `generation` | `Int?` | 否 | — | L0/L2 | 世代；用于筛选与校验 |
| `branch` | `String?` | 否 | — | L0/L2 | 支系；用于筛选 |
| `status` | `String` | 是 | `"ACTIVE"` | L1 | 取值 `PERSON_STATUSES`；生命周期见 6.1 |
| `mergedIntoId` | `String?` | 否 | — | L1 | 自关联 → Person.id；SetNull；仅 MERGED 使用 |
| `version` | `Int` | 是 | `1` | L1 | 乐观锁；成功写入后 +1 |
| `deletedAt` | `DateTime?` | 否 | — | L1 | 软删除时间；status=DELETED 时非空 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.4 Relation（关系）

- 作用：亲子与配偶关系；PARENT_CHILD 中 A=父/母、B=子女；SPOUSE 中 A/B 规范化排序。
- 关系导航：`personA`、`personB`、`events`（非数据库列）。
- 业务约束：禁止自环；同一 `(type, personAId, personBId)` 唯一；亲子环、性别角色冲突、跨家族端点由服务层拒绝；更新使用 `version`；删除只能走 DELETE_RELATION 审核。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `type` | `String` | 是 | — | L0/L2 | 取值 `RELATION_TYPES` |
| `personAId` | `String` | 是 | — | L1 | 外键 → Person.id；Restrict |
| `personBId` | `String` | 是 | — | L1 | 外键 → Person.id；Restrict |
| `parentRole` | `String?` | 否 | — | L0/L2 | 取值 `PARENT_ROLES`；PARENT_CHILD 语义字段 |
| `childKind` | `String?` | 否 | — | L0/L2 | 取值 `CHILD_KINDS`；亲子子女类型 |
| `spouseKind` | `String?` | 否 | — | L0/L2 | 取值 `SPOUSE_KINDS`；配偶关系类型 |
| `certainty` | `String` | 是 | `"CERTAIN"` | L1 | 取值 `CERTAINTIES`；存疑关系在亲缘结论中提示 |
| `note` | `String?` | 否 | — | L1/L2 | 关系备注；可能包含敏感细节 |
| `version` | `Int` | 是 | `1` | L1 | 乐观锁；成功写入后 +1 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.5 Event（事件）

- 作用：出生、死亡、婚姻、离婚及其他事件；可挂人物或关系。
- 关系导航：`person`、`relation`（非数据库列）。
- 业务约束：`personId` 与 `relationId` 至少一个（应用层）；婚姻/离婚事件建议挂 `relationId`；日期规则与 Person 部分日期一致；校验只读，不修改事件。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `type` | `String` | 是 | — | L0/L2 | 取值 `EVENT_TYPES` |
| `personId` | `String?` | 否 | — | L1 | 外键 → Person.id；Restrict |
| `relationId` | `String?` | 否 | — | L1 | 外键 → Relation.id；Restrict |
| `year` | `Int?` | 否 | — | L1/L2 | 事件年 |
| `month` | `Int?` | 否 | — | L1/L2 | 事件月；需要年 |
| `day` | `Int?` | 否 | — | L1/L2 | 事件日；需要年+月 |
| `dateText` | `String?` | 否 | — | L1/L2 | 日期原文 |
| `precision` | `String` | 是 | `"UNKNOWN"` | L1/L2 | 取值 `PRECISIONS` |
| `approximate` | `Boolean` | 是 | `false` | L1/L2 | 约值标记 |
| `calendar` | `String` | 是 | `"UNKNOWN"` | L1/L2 | 取值 `CALENDARS` |
| `place` | `String?` | 否 | — | L1/L2 | 地点；在世者 VIEWER 截断 |
| `description` | `String?` | 否 | — | L1/L2 | 事件描述 |
| `certainty` | `String` | 是 | `"CERTAIN"` | L1 | 取值 `CERTAINTIES` |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.6 Source（来源）

- 作用：老谱图片/文本、口述、书籍、墓碑、GEDCOM 等来源及其转写。
- 关系导航：`citations`、`aiJobs`、`gedcomImports`（非数据库列）。
- 业务约束：上传限制（≤10MB、MIME/魔数白名单、随机文件名、哈希）由 2.2.3 实现；`storagePath` 永不返回前端；文件仅授权角色经鉴权流式读取；不做自动 OCR。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `type` | `String` | 是 | — | L1 | 取值 `SOURCE_TYPES` |
| `title` | `String` | 是 | — | L1 | 来源标题 |
| `description` | `String?` | 否 | — | L2 | 来源说明；可能含在世者信息 |
| `fileName` | `String?` | 否 | — | L1 | 原始文件名；上传时去路径 |
| `mimeType` | `String?` | 否 | — | L1 | 白名单校验后的 MIME |
| `sizeBytes` | `Int?` | 否 | — | L1 | 文件大小；上限 10MB |
| `fileHash` | `String?` | 否 | — | L1 | 文件哈希；用于重复提示，非唯一 |
| `storagePath` | `String?` | 否 | — | L3 | 服务器路径；禁止返回/日志/导出 |
| `rawText` | `String?` | 否 | — | L2 | 人工转写或粘贴文本；可能含在世者信息 |
| `transcriptionStatus` | `String` | 是 | `"PENDING"` | L1 | 取值 `TRANSCRIPTION_STATUSES`；见 6.3 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.7 Citation（字段级引用）

- 作用：把来源原文绑定到人物/关系/事件的字段路径，是“可追溯”的基础。
- 关系导航：`source`（非数据库列）。
- 业务约束：`quote` 非空；`targetType` 属于 `CITATION_TARGET_TYPES`；`targetId` 指向存在的实体；`fieldPath` 必须在白名单内（如 `birth.year`、`name.given`）；删除引用写审计；多态目标无外键。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `sourceId` | `String` | 是 | — | L1 | 外键 → Source.id；Restrict |
| `targetType` | `String` | 是 | — | L1 | 取值 `CITATION_TARGET_TYPES` |
| `targetId` | `String` | 是 | — | L1 | 目标实体 ID；应用层校验存在 |
| `fieldPath` | `String` | 是 | — | L1 | 字段路径；白名单校验 |
| `quote` | `String` | 是 | — | L2 | 原文引文；非空；可能含在世者信息 |
| `page` | `String?` | 否 | — | L1 | 页码/位置 |
| `confidence` | `Float?` | 否 | — | L1 | 0–1；人工引用可为空 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.8 AiJob（AI 任务）

- 作用：记录抽取/叙事/亲缘意图任务的状态、Provider、Prompt 版本、输入哈希、脱敏输入与输出。
- 关系导航：`source`、`drafts`（非数据库列）。
- 业务约束：状态机见 6.4；超时/网络错误 → FAILED；重试创建新任务，不覆盖历史；调用第三方前必须脱敏；`maskMap` 为 L3；日志禁止明文敏感数据。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `kind` | `String` | 是 | — | L1 | 取值 `AI_JOB_KINDS` |
| `sourceId` | `String?` | 否 | — | L1 | 外键 → Source.id；SetNull |
| `status` | `String` | 是 | `"PENDING"` | L1 | 取值 `AI_JOB_STATUSES`；见 6.4 |
| `provider` | `String` | 是 | — | L1 | 取值 `AI_PROVIDERS`；mock/openai-compatible |
| `model` | `String?` | 否 | — | L1 | Provider 模型标识 |
| `promptVersion` | `String` | 是 | — | L1 | Prompt 版本，用于追溯 |
| `inputHash` | `String` | 是 | — | L1 | 输入哈希；重复任务提示 |
| `maskedInput` | `String?` | 否 | — | L1/L2 | 脱敏后发送的输入；仍按最小化保存 |
| `maskMap` | `String?` | 否 | — | L3 | 占位符→真实值映射；禁止返回前端/日志 |
| `outputJson` | `String?` | 否 | — | L1/L2 | 模型原始输出（JSON 字符串）；需 zod 校验 |
| `errorMessage` | `String?` | 否 | — | L2 | 失败原因；禁止回显完整敏感输入 |
| `statsJson` | `String?` | 否 | — | L1 | Token/耗时等统计 |
| `startedAt` | `DateTime?` | 否 | — | L1 | 进入 RUNNING 的时间 |
| `finishedAt` | `DateTime?` | 否 | — | L1 | 进入 SUCCEEDED/FAILED 的时间 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.9 AiDraft（AI 草稿）

- 作用：AI 抽取产生的人物/关系/事件草稿；必须人工确认后才写入正式表。
- 关系导航：`job`、`reviewedBy`（非数据库列）。
- 业务约束：`sourceQuote` 必须是来源文本子串；字段值必须能在引文中找到依据；接受前重新校验；同一任务内 `(draftType, tempId)` 唯一；接受/拒绝后不可逆；不存在自动接受接口；接受事务见 6.5。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `jobId` | `String` | 是 | — | L1 | 外键 → AiJob.id；Restrict |
| `draftType` | `String` | 是 | — | L1 | 取值 `DRAFT_TYPES` |
| `tempId` | `String` | 是 | — | L1 | 任务内临时 ID；关系/事件依赖解析 |
| `payloadJson` | `String` | 是 | — | L2 | 草稿字段 JSON；可能含在世者信息；zod 校验 |
| `sourceQuote` | `String` | 是 | — | L2 | 原文引文；非空且必须为来源子串 |
| `confidence` | `Float` | 是 | — | L1 | 0–1；越界截断，缺失拒绝 |
| `warningsJson` | `String?` | 否 | — | L1/L2 | 校验警告数组 JSON |
| `status` | `String` | 是 | `"PENDING"` | L1 | 取值 `DRAFT_STATUSES`；见 6.5 |
| `reviewedById` | `String?` | 否 | — | L1 | 外键 → User.id；SetNull |
| `reviewedAt` | `DateTime?` | 否 | — | L1 | 接受/拒绝时间 |
| `appliedEntityType` | `String?` | 否 | — | L1 | 落地实体类型；接受后写入 |
| `appliedEntityId` | `String?` | 否 | — | L1 | 落地实体 ID；接受后写入 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.10 Narrative（叙事）

- 作用：基于有来源事实包生成的叙事草稿；确认后只读，可导出 Markdown/HTML。
- 关系导航：`subjectPerson`、`createdBy`、`confirmedBy`（非数据库列）。
- 业务约束：`contentJson` 结构为 `sections[].sentences[]`，每句 `{ id, text, factRefs[] }`；factRefs 由服务端附加；无有效 factRef 的句子不能确认；已确认只读；重新生成新记录；仅 CONFIRMED 可导出；VIEWER 无叙事权限。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `subjectPersonId` | `String` | 是 | — | L1 | 外键 → Person.id；Restrict |
| `title` | `String` | 是 | — | L1/L2 | 叙事标题；可能含姓名 |
| `paramsJson` | `String?` | 否 | — | L1 | 生成参数 JSON（范围/长度等） |
| `contentJson` | `String` | 是 | — | L1/L2 | 叙事正文 JSON；含 factRefs；确认前可编辑 |
| `status` | `String` | 是 | `"DRAFT"` | L1 | 取值 `NARRATIVE_STATUSES`；见 6.6 |
| `createdById` | `String` | 是 | — | L1 | 外键 → User.id；Restrict |
| `confirmedById` | `String?` | 否 | — | L1 | 外键 → User.id；SetNull |
| `confirmedAt` | `DateTime?` | 否 | — | L1 | 确认时间 |
| `version` | `Int` | 是 | `1` | L1 | 草稿编辑乐观锁；确认后只读 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.11 ConsistencyIssue（一致性问题）

- 作用：保存 18 条一致性规则的检出结果；支持忽略/解决与复检。
- 关系导航：无（实体为多态引用，无外键）。
- 业务约束：`dedupeKey` 唯一，避免重复问题；忽略必须填理由；复检未再出现自动 RESOLVED（resolvedBy=SYSTEM，理由“复检未再出现”）；IGNORED 复检保持；状态见 6.7；校验只读，不修改档案。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `code` | `String` | 是 | — | L1 | 规则码（如 `E-DATE-001`） |
| `severity` | `String` | 是 | — | L1 | 取值 `ISSUE_SEVERITIES` |
| `entityType` | `String` | 是 | — | L1 | 被校验实体类型（多态） |
| `entityId` | `String` | 是 | — | L1 | 被校验实体 ID（多态，无外键） |
| `message` | `String` | 是 | — | L2 | 问题描述；可能含姓名/日期 |
| `detailsJson` | `String?` | 否 | — | L2 | 规则详情 JSON；可能含敏感上下文 |
| `dedupeKey` | `String` | 是 | — | L1 | 唯一；由规则码+实体+关键字段生成 |
| `status` | `String` | 是 | `"OPEN"` | L1 | 取值 `ISSUE_STATUSES`；见 6.7 |
| `ignoreReason` | `String?` | 否 | — | L2 | 忽略理由；忽略时必填 |
| `ignoredById` | `String?` | 否 | — | L1 | 忽略操作人 ID（无外键，保留历史） |
| `ignoredAt` | `DateTime?` | 否 | — | L1 | 忽略时间 |
| `firstSeenAt` | `DateTime` | 是 | `now()` | L1 | 首次发现时间 |
| `lastSeenAt` | `DateTime` | 是 | `now()` | L1 | 最近一次检出时间 |
| `resolvedAt` | `DateTime?` | 否 | — | L1 | 解决时间 |
| `resolvedById` | `String?` | 否 | — | L1 | 解决人 ID；SYSTEM 场景可为空或系统标识 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.12 ReviewRequest（审核请求）

- 作用：合并人物、删除人物、删除关系的审批请求；审批通过后执行高风险事务。
- 关系导航：`requestedBy`、`decidedBy`（非数据库列）。
- 业务约束：状态机见 6.8；仅 EDITOR/ADMIN 可发起，REVIEWER/ADMIN 可审批；ADMIN 自批需二次确认+理由；审批前校验 `expectedVersionsJson`；版本变化返回 409 且保持 PENDING；审批与执行同事务；执行失败回滚并保持 PENDING；请求不删除。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `action` | `String` | 是 | — | L1 | 取值 `REVIEW_ACTIONS` |
| `payloadJson` | `String` | 是 | — | L2 | 动作参数 JSON；可能含人物数据 |
| `diffJson` | `String` | 是 | — | L2 | 差异快照 JSON；供审批对比 |
| `status` | `String` | 是 | `"PENDING"` | L1 | 取值 `REVIEW_STATUSES`；见 6.8 |
| `requestedById` | `String` | 是 | — | L1 | 外键 → User.id；Restrict |
| `decidedById` | `String?` | 否 | — | L1 | 外键 → User.id；SetNull |
| `decisionComment` | `String?` | 否 | — | L2 | 审批意见/自批理由 |
| `expectedVersionsJson` | `String` | 是 | — | L1 | 发起时的实体版本快照 JSON |
| `decidedAt` | `DateTime?` | 否 | — | L1 | 审批/驳回/撤回时间 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.13 AuditLog（审计日志）

- 作用：记录认证、写操作与高风险动作；只追加，不可修改/删除。
- 关系导航：`actor`（非数据库列）。
- 业务约束：无 `updatedAt`；SQLite 触发器阻止 UPDATE/DELETE（2.1.3）；仅 ADMIN/REVIEWER 查询；快照可能含敏感数据，接口严格限权；普通日志对敏感字段 redact。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `actorId` | `String?` | 否 | — | L1 | 外键 → User.id；SetNull；系统动作可为空 |
| `actorRole` | `String` | 是 | — | L1 | 操作时角色快照 |
| `action` | `String` | 是 | — | L1 | 动作名（见 Spec 2.12.4） |
| `entityType` | `String?` | 否 | — | L1 | 实体类型；多态，无外键 |
| `entityId` | `String?` | 否 | — | L1 | 实体 ID；多态，无外键 |
| `beforeJson` | `String?` | 否 | — | L2 | 变更前快照 JSON；可能含敏感数据 |
| `afterJson` | `String?` | 否 | — | L2 | 变更后快照 JSON；可能含敏感数据 |
| `reason` | `String?` | 否 | — | L2 | 变更理由/拒绝理由；可能含个人数据 |
| `ip` | `String?` | 否 | — | L3 | 客户端 IP；禁止前端返回/普通日志 |
| `userAgent` | `String?` | 否 | — | L3 | 客户端 UA；禁止前端返回/普通日志 |
| `requestId` | `String?` | 否 | — | L1 | 请求关联 ID；用于排障 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 记录时间；只追加 |

### 5.14 GedcomImport（GEDCOM 导入批次）

- 作用：保存 GEDCOM 解析/预览/提交状态、文件哈希、预览与映射结果。
- 关系导航：`source`、`createdBy`、`xrefs`（非数据库列）。
- 业务约束：状态机见 6.9；预览阶段不写正式表；同文件哈希在已 COMMITTED 时阻止重复导入；提交必须原子；取消后 CANCELLED 且无半成品；每个导入实体有来源行引用；写审计。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `sourceId` | `String` | 是 | — | L1 | 外键 → Source.id；Restrict |
| `status` | `String` | 是 | `"PARSED"` | L1 | 取值 `GEDCOM_IMPORT_STATUSES`；见 6.9 |
| `fileHash` | `String` | 是 | — | L1 | 文件哈希；非唯一；幂等检查用 |
| `previewJson` | `String?` | 否 | — | L2 | 预览统计/警告/候选 JSON；可能含在世者姓名 |
| `mappingJson` | `String?` | 否 | — | L1 | 映射选项 JSON |
| `statsJson` | `String?` | 否 | — | L1 | 导入计数统计 JSON |
| `errorMessage` | `String?` | 否 | — | L1 | 解析/提交失败原因 |
| `createdById` | `String` | 是 | — | L1 | 外键 → User.id；Restrict |
| `committedAt` | `DateTime?` | 否 | — | L1 | 提交成功时间 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |
| `updatedAt` | `DateTime` | 是 | `@updatedAt` | L1 | 更新时间 |

### 5.15 GedcomXref（GEDCOM 标识映射）

- 作用：记录 GEDCOM xref 与系统实体的映射，用于幂等导入与往返导出。
- 关系导航：`gedcomImport`（非数据库列）。
- 业务约束：同一批次内 xref 唯一；仅由提交事务写入；批次删除时 Cascade 清理；实体 ID 为多态引用，无外键。

| 字段 | Prisma 类型 | 必填 | 默认值 | 敏感级别 | 约束与说明 |
|---|---|---|---|---|---|
| `id` | `String` | 是 | `cuid()` | L1 | 主键 |
| `importId` | `String` | 是 | — | L1 | 外键 → GedcomImport.id；Cascade |
| `xref` | `String` | 是 | — | L1 | GEDCOM xref（如 `@I1@`） |
| `entityType` | `String` | 是 | — | L1 | 映射实体类型（Person/Family/Relation/Event） |
| `entityId` | `String` | 是 | — | L1 | 系统实体 ID；多态，无外键 |
| `createdAt` | `DateTime` | 是 | `now()` | L1 | 创建时间 |

## 6 状态机

> 所有状态字段的允许值由第 4 章常量组定义；数据库不强制状态转换，服务层状态机与测试负责拒绝非法转换。状态机与 Spec 2.7.3–2.7.5、2.12、2.5.2 保持一致。

### 6.1 `Person.status`（人物记录生命周期）

允许值：`ACTIVE`、`MERGED`、`DELETED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| ACTIVE | MERGE_PERSON 审核通过并执行 | MERGED | 源人物 `mergedIntoId` 指向保留者；合并关系/引用；version+1；写审计 |
| ACTIVE | DELETE_PERSON 审核通过并执行 | DELETED | 设置 `deletedAt`；关系按确认级联处理；写审计 |
| MERGED | — | — | 终态；默认查询排除；可通过 `mergedIntoId` 追溯 |
| DELETED | — | — | 终态；默认查询排除；审计可查 |

规则：

1. 只允许 ACTIVE → MERGED / DELETED，禁止任何回退或 MERGED ↔ DELETED。
2. 合并前校验：非自身、同家族、源/目标均 ACTIVE、无既有合并链；非法时由 `shared/utils/person-state.ts` 拒绝。
3. 软删除后不物理删除人物；关系、事件、引用保留，审计保存快照。
4. 默认列表/树/查询使用 `status=ACTIVE`；审计、合并追溯可显式包含其他状态。

### 6.2 `Person.livingStatus`（在世状态）

允许值：`LIVING`、`DECEASED`、`UNKNOWN`。

| 场景 | 结果 | 说明 |
|---|---|---|
| 新建人物，未填死亡日期/事件 | LIVING | 默认；不得因年龄推断死亡 |
| 新建人物，明确填写死亡日期或死亡事件 | DECEASED | 保存前弹窗确认；写审计 |
| 导入 GEDCOM 有 DEAT | DECEASED | 预览显示数量 |
| 导入 GEDCOM 无 DEAT | LIVING | 预览警告“未提供死亡信息，按在世处理” |
| 状态未知 | UNKNOWN | 按 LIVING 遮罩；不进入任何公开导出 |

规则：

1. LIVING → DECEASED 是敏感变更：保存前二次确认并填写依据，写审计。
2. DECEASED → LIVING 同样敏感：二次确认 + 理由 + 审计；不得由系统自动回退。
3. UNKNOWN 仅用于导入/历史数据无法判断；人工修正为 LIVING/DECEASED 需确认并审计。
4. 不得仅凭年龄、配偶/子女在世情况推断死亡；死亡事实必须来自用户确认或 GEDCOM DEAT。
5. 该状态只影响隐私遮罩与导出，不改变 `Person.status`（记录生命周期）。

### 6.3 `Source.transcriptionStatus`（转写状态）

允许值：`PENDING`、`IN_PROGRESS`、`COMPLETED`、`FAILED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| PENDING | 开始编辑/保存转写 | IN_PROGRESS | 保存原始转写文本；不做 OCR |
| IN_PROGRESS | 转写完成并保存 | COMPLETED | 文本非空；可进入 AI 抽取 |
| PENDING / IN_PROGRESS | 处理失败 | FAILED | 记录错误；可重试 |
| FAILED | 重试 | IN_PROGRESS | 不覆盖原始来源文件 |
| COMPLETED | 重新编辑并保存 | COMPLETED | 更新文本；不改变状态 |

说明：MVP 不自动识别图片文字；无转写文本不得进入抽取。更细的接口约束由 3.3.1 固化，不新增状态。

### 6.4 `AiJob.status`（AI 任务）

允许值：`PENDING`、`RUNNING`、`SUCCEEDED`、`FAILED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| PENDING | 开始调用 Provider | RUNNING | 记录 `startedAt` |
| RUNNING | Provider 返回且 Schema/引文校验通过 | SUCCEEDED | 记录 `finishedAt`、`outputJson`、统计；生成 AiDraft |
| RUNNING | 超时/网络错误/结构化输出失败 | FAILED | 记录 `finishedAt`、`errorMessage`；不写正式表 |
| SUCCEEDED | — | — | 终态；历史保留 |
| FAILED | — | — | 终态；重试创建新任务，不覆盖 |

规则：

1. 不允许 PENDING → SUCCEEDED/FAILED 跳过 RUNNING，也不允许终态回流。
2. 任一任务失败不得自动重试覆盖；用户明确重试才创建新 AiJob。
3. 相同 `inputHash` 只提示重复，允许用户确认后重跑。
4. 出站仅发送脱敏文本；`maskMap` 仅服务端使用，返回后按映射还原并校验占位符。

### 6.5 `AiDraft.status`（AI 草稿）

允许值：`PENDING`、`ACCEPTED`、`REJECTED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| PENDING | 人工接受（逐条/批量中的单项） | ACCEPTED | 重新校验引文子串与字段依据；独立事务创建实体+Citation+AuditLog；写 `reviewedBy/At`、`appliedEntityType/Id` |
| PENDING | 人工拒绝 | REJECTED | 只改草稿状态；理由写审计；不写正式表 |
| ACCEPTED | — | — | 终态；不可重复接受 |
| REJECTED | — | — | 终态；可保留供追溯 |

规则：

1. 不存在自动接受任何置信度草稿的接口或配置；低置信仅提示。
2. 接受前若 `sourceQuote` 不是来源子串 → `QUOTE_NOT_FOUND`；字段值不在引文中 → `FIELD_NOT_IN_QUOTE`；校验不通过不得接受。
3. 人员 → 关系 → 事件按依赖顺序落地；`tempId` 映射到新建 ID 或已有关联 ID；端点被拒绝/未映射的关系与事件跳过并返回原因。
4. 批量接受逐项独立事务并汇总，不做整批回滚；重复接受被拒绝。
5. 关联已有人员仅补 Citation，不覆盖已有字段。

### 6.6 `Narrative.status`（叙事）

允许值：`DRAFT`、`CONFIRMED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| DRAFT | 编辑内容 | DRAFT | 校验 contentJson 结构；version 乐观锁；不写正式事实 |
| DRAFT | 人工确认 | CONFIRMED | 校验每句至少一个有效 factRef；写 confirmedBy/At；写审计；此后只读 |
| CONFIRMED | — | — | 终态；不可回退；重新生成创建新 Narrative 记录 |

规则：

1. 仅使用至少有一条 Citation 的事实构建事实包；无来源事实进入 excludedFacts，不写入正文。
2. 模型返回的伪引用被丢弃；引用由服务端根据 factRefs 附加。
3. 无有效 factRef 的句子不能确认；确认后禁止 PATCH。
4. 仅 CONFIRMED 可导出 Markdown/HTML；HTML 全量转义；导出执行在世者遮罩并写审计。
5. VIEWER 无叙事查看/生成/导出权限。

### 6.7 `ConsistencyIssue.status`（一致性问题）

允许值：`OPEN`、`IGNORED`、`RESOLVED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| OPEN | 用户忽略（必须填写理由） | IGNORED | 写 ignoreReason/ignoredBy/ignoredAt；写审计 |
| OPEN | 用户解决或复检未再出现 | RESOLVED | 写 resolvedAt/resolvedById；SYSTEM 自动解决理由“复检未再出现”；写审计 |
| IGNORED | 复检再次出现 | IGNORED | 保持忽略；更新 lastSeenAt |
| IGNORED | 复检未再出现 | IGNORED | 保持忽略，不自动解决 |
| RESOLVED | 同一 dedupeKey 再次检出 | OPEN | 更新 lastSeenAt；清空 resolvedAt/resolvedById；重新进入待处理 |
| RESOLVED | 复检未再出现 | RESOLVED | 保持解决；更新 lastSeenAt 仅在新检出时 |

规则：

1. 同一问题由 `dedupeKey` 唯一定位；重复运行不产生重复记录。
2. 忽略必须填写理由；不可无理由忽略。
3. 校验只读，不修改人物/关系/事件数据。
4. RESOLVED 再次检出允许重新打开；IGNORED 永不自动打开或解决，需人工处理。

### 6.8 `ReviewRequest.status`（审核请求）

允许值：`PENDING`、`APPROVED`、`REJECTED`、`CANCELLED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| PENDING | 审批通过且执行成功 | APPROVED | 审批与执行同一事务；校验 expectedVersionsJson；成功写 decidedBy/At、decisionComment、审计 |
| PENDING | 审批驳回 | REJECTED | 写 decidedBy/At、decisionComment、审计；不执行 |
| PENDING | 发起人撤回 | CANCELLED | 仅发起人可撤回；写 decidedAt、审计 |
| PENDING | 版本不匹配 | PENDING | 返回 409 `CONFLICT_VERSION`；请求保持待审；要求重新预览/发起 |
| PENDING | 执行失败 | PENDING | 事务回滚；错误写审计/服务日志；请求保持待审 |
| APPROVED / REJECTED / CANCELLED | — | — | 终态；不可再次审批 |

规则：

1. 仅 PENDING 可审批/驳回/撤回；非法转换拒绝。
2. 仅 EDITOR/ADMIN 可发起；仅 REVIEWER/ADMIN 可审批；ADMIN 自批必须二次确认 + 理由。
3. 审批后调用 2.2.4 合并/删除事务；不可绕过审核直接执行。
4. 合并/删除执行成功写 `MERGE_EXECUTE`/对应审计快照；失败整体回滚。

### 6.9 `GedcomImport.status`（GEDCOM 导入批次）

允许值：`PARSED`、`PREVIEWED`、`COMMITTED`、`FAILED`、`CANCELLED`。

| 当前状态 | 触发 | 目标状态 | 条件与副作用 |
|---|---|---|---|
| PARSED | 预览生成并持久化 | PREVIEWED | 写 previewJson；预览阶段不写正式表 |
| PREVIEWED | 映射确认并提交成功 | COMMITTED | 原子写入人物/家庭/关系/事件/来源/引用/Xref；写 committedAt、审计 |
| PARSED / PREVIEWED | 解析/提交失败 | FAILED | 记录 errorMessage；事务回滚，无半成品 |
| PREVIEWED | 用户取消 | CANCELLED | 不写正式表；无半成品；审计 |
| COMMITTED | — | — | 终态；同文件哈希再次导入被阻止 |
| FAILED / CANCELLED | — | — | 终态；允许重新导入（新批次） |

规则：

1. 预览只写 GedcomImport 自身与临时预览 JSON，不写 Person/Relation/Event/Source/Citation。
2. 提交必须在单一事务内完成；任一实体失败整体回滚并标 FAILED。
3. 仅已 COMMITTED 的文件哈希阻止重复导入；FAILED/CANCELLED 可重新导入。
4. 提交后每个导入实体必须有来源行引用；`GedcomXref` 记录 xref → 实体映射。
5. 取消/失败后不得残留半成品正式数据。

## 7 数据库无法表达、由应用层保证的约束

| 约束 | 涉及模型 | 保证方式 | 责任包 |
|---|---|---|---|
| Event 至少关联 person 或 relation | Event | zod + 服务层；创建/更新前校验 | 2.2.3 |
| Citation 目标存在、fieldPath 白名单、quote 非空 | Citation | 多态查询 + 字段白名单 + zod | 2.2.3 |
| AiDraft 引文子串、字段在引文中、无自动接受 | AiDraft | 抽取校验器 + 接受事务重校验 | 2.4.2 / 2.4.3 |
| Narrative 每句 factRef 有效、确认后只读 | Narrative | 事实包 + factRef 解析 + 服务层拒绝 PATCH | 2.4.4 |
| Person 状态转换、合并资格、软删除过滤 | Person | `shared/utils/person-state.ts` + 查询条件 | 3.1.2 / 2.2.4 |
| 版本乐观锁（Person/Relation/Narrative） | Person / Relation / Narrative | `executeVersionedWrite`；不匹配 409 | 3.1.2 / 2.2.x |
| 枚举值域、JSON 结构有效 | 全部字符串枚举与 JSON 字段 | 共享常量 + zod；读取时处理解析失败 | 3.3.1 |
| Review 审批权限、自批规则、版本复核、同事务执行 | ReviewRequest | 状态机 + RBAC + 版本校验 + 事务 | 2.6.1 / 2.6.2 |
| GEDCOM 幂等、原子提交、取消无半成品 | GedcomImport / GedcomXref | 文件哈希查询 + 事务 + 状态机 | 2.5.2 |
| 关系自环/亲子环/性别角色/跨家族、配偶规范化 | Relation | 图约束服务 + 唯一约束 | 2.2.2 |
| 审计不可更新/删除 | AuditLog | SQLite 触发器 + 无修改 API | 2.1.3 |
| 在世者遮罩、VIEWER 无叙事/原文件 | Person / Citation / Narrative / Source | 统一 presenter + RBAC + 导出策略 | 2.7.x / 3.5.x |
| 来源路径不可穿越、文件鉴权 | Source | 随机文件名 + 路径校验 + 鉴权流 | 2.2.3 |
| 日期不伪造、精度一致、约值降级 | Person / Event | `shared/utils/date.ts` | 3.1.2 |

## 8 文档与 schema 一致性检查

自动化测试：`server/tests/docs.spec.ts`（随 `npm test` 运行），校验：

1. 模型集合、字段集合、字段类型与可选性：数据字典第 5 章 ↔ `schema.prisma`；
2. 每个字段的敏感级别标注：必须为 L0–L3 或条件级别（`L0/L2`、`L1/L2`）；
3. 物理外键与 `onDelete`：`docs/er.md` 3.1 节 ↔ schema 的 `@relation(fields: ...)`；
4. 索引/唯一约束：`docs/er.md` 第 5 章 ↔ schema 的 `@unique`、`@@unique`、`@@index`；
5. ER 图实体覆盖：Mermaid 块包含全部 15 个模型；
6. 状态机覆盖：第 6 章包含所有状态字段，允许值 ↔ `shared/src/constants/enums.ts`；
7. 枚举字典：第 4 章 26 个常量组及全部允许值 ↔ 常量文件。

人工复核：

- ER 基数、删除语义、评审结论与 Spec 2.4.2、2.6.3、2.7.4、2.7.5、2.12 一致；
- 敏感级别与 Spec 2.6.2 的 L0–L3 定义一致；
- 状态机与审核/叙事/草稿/GEDCOM 的 Spec 条款一致。
