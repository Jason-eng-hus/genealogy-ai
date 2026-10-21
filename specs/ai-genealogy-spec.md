# AI 家谱编辑系统 — 规格说明（Spec v1.0）

| 项 | 内容 |
|---|---|
| 项目 | AI 家谱编辑系统（`genealogy-ai`） |
| 版本 | v1.0（校订 R2） |
| 日期 | 2026-10-21 |
| 状态 | **实现中：3.2.1、3.2.2 已完成并验证，等待下一工作包授权** |
| 工作模式 | Quest / Spec 驱动 / Local（不使用 Worktree） |
| 项目规则 | `.qoder/rules/genealogy-ai.md`（优先级高于 `AGENTS.md`） |
| 唯一事实来源 | 本文件（`specs/ai-genealogy-spec.md`） |
| 技术栈 | React 18 + TypeScript + Ant Design 5 + React Flow / Express 4 + Prisma + SQLite / OpenAI 兼容 + Mock |
| 目标部署 | 先本地单机，后期可整体迁移到一台云服务器 |

## 审核清单（请逐项确认）

- [ ] 第 1 部分：MVP 范围、非目标、五项原则的落地方式；
- [ ] 第 2 部分：技术栈、数据模型、角色与脱敏矩阵、AI/校验/亲缘/GEDCOM/叙事设计；
- [ ] 第 3 部分：59 个第 3 层工作包、依赖关系、11 个交付批次；
- [ ] 第 4 部分：验收标准与端到端演示剧本；
- [ ] 第 5 部分：8 个待人工确认问题的默认处理方案。

审核通过后，请明确回复 **“Run”**；我只会从 B1 的第一个工作包开始，先提交该包的实现方案与文件清单，等待你的再次授权后才写代码。未收到 Run 之前，不安装依赖、不建库、不写业务代码。

> **校订 R2（2026-10-21）**：统一迁移归属（初始迁移 3.1.1、审计触发器 2.1.3）；导出策略 2.7.3 前移至 B3；补齐 `GedcomImport` 的 `CANCELLED` 状态与 1,000/10,000 人物基准脚本；隐私口径统一为 VIEWER 无叙事权限；完成 59 包依赖/批次顺序校验。
>
> **实现进度（2026-10-21）**：`3.1.1 Prisma 模型、枚举值与关系` 已完成；初始迁移 `20261021093501_init` 已在 `data/genealogy.db` 应用，schema 测试 12/12 通过。`3.1.2 部分日期、不确定值、软删除与版本规范` 已完成：共享日期/状态/版本纯函数与 45 项单元测试通过，完整测试 57/57。`3.1.3 ER 图、数据字典与模型评审记录` 已完成：`docs/er.md`（Mermaid ER、19 条物理外键、逻辑引用、删除语义、55 项索引/唯一约束、15 条评审结论）、`docs/data-dictionary.md`（15 模型全字段、26 个枚举组、敏感级别、9 个状态机、应用层约束）与 `server/tests/docs.spec.ts`（11 项一致性测试）通过；完整测试 68/68，`tsc --noEmit` 无错误。`3.2.1 SQLite 初始化、连接参数与迁移` 已完成：新增 `.env.example`、`server/src/config/env.ts`（`.env` 不覆盖既有变量、SQLite `file:` 路径校验、相对路径按 schema 目录解析、固定 5000ms busy_timeout）、`server/src/lib/prisma.ts`（连接单例、WAL / foreign_keys / busy_timeout 应用与回读、迁移台账检查、幂等关闭）、`scripts/db-check.ts`、`db-migrate.ts`、`db-reset.ts` 与 CLI 支持模块；重置仅删除目标数据库及 journal 文件，需 `--confirm=RESET` 或交互式输入 `RESET`，拒绝生产环境与项目外路径，uploads/backups/种子重置留给 3.6.3。新增 `database-config` 17 项（1 项 POSIX 用例在 Windows 跳过）、`prisma` 10 项、`db-scripts` 9 项测试，完整测试 103 通过 / 1 跳过（8 个测试文件），`tsc --noEmit` 无错误；全部测试库位于 `server/prisma/.tmp/`，未改动 `data/genealogy.db`。`3.2.2 索引、文件存储与备份恢复` 已完成：新增迁移 `20261021143602_query_indexes`，将 9 个冗余单列索引替换为复合索引（Relation A/B 端+type、Event person/relation+type、AiDraft jobId+status、ConsistencyIssue status+severity+lastSeenAt、AuditLog actor/action/entity+createdAt），索引总数保持 55；`docs/er.md` 索引清单同步。新增 `loadStorageConfig`（UPLOAD_DIR/BACKUP_DIR 限定项目内、相等/嵌套拒绝、NUL 拒绝）、`shared/src/constants/files.ts`（10MB、扩展名/MIME 白名单）、`server/src/services/files.ts`（UUID 随机命名、路径穿越防护、临时文件原子重命名、SHA-256）、`scripts/backup.ts`（VACUUM INTO + uploads 递归复制、符号链接拒绝、manifest 行数/大小/哈希、integrity_check、失败清理、无自动清理）与 `docs/storage-and-backup.md`（恢复步骤、密钥与保留要求）。新增 `storage-config` 12 项、`files` 12 项、`backup` 11 项（Windows 跳过 1 项符号链接）、`indexes` 4 项测试；完整测试 141 通过 / 2 跳过（12 个测试文件），`tsc --noEmit` 无错误。手工用 `.tmp/backup-check.db` 验证两段迁移、备份、manifest 与 `[backup] OK` 后已清理临时文件；未改动真实 `data/genealogy.db`、`data/uploads`、`data/backups`。B1 其余工作包须逐个授权，未授权不进入；下一工作包待负责人指定并授权。

---

## 0. 执行方式与门禁

1. **只走 Spec 驱动**：本文件是后续所有实现的唯一依据；代码、测试、文档不得偏离第 4 部分验收标准。
2. **Local 执行**：全部改动发生在本地工作区 `C:\Users\jt200\Desktop\qoder cn\genealogy-ai`，不使用 Worktree；每个工作包的文件变更可逐个接受或丢弃。
3. **Spec 先行**：你审核本文件并回复 Run 之后才进入实现；实现从 B1 开始，按依赖顺序推进。
4. **逐包门禁**：每个工作包先给实现方案 + 文件路径清单 → 你授权 → 完整实现 + 迁移 + 测试 + 验证步骤 → 自查报告 → 你授权后进入下一包。
5. **命令门禁**：安装依赖、迁移数据库、启动服务等命令，先列命令、作用与影响，确认后再执行；不使用 sudo、不做全局安装、不改系统配置。
6. **范围冻结**：不自行追加需求；WBS 第 1/2 层不变；发现遗漏只写入本文件第 5 部分“待人工确认问题”，不擅自改动。

---

# 1. 需求描述

## 1.1 项目背景与目标

传统家谱整理有三类核心痛点：

1. **录入太苦**：老谱多为图片或手写文本，人工逐条录入人物、关系、生卒信息耗时且易错。
2. **关系太绕**：多代、多支系、再婚、收养、过继等关系容易产生矛盾，人工难以发现年龄、时间、性别角色冲突。
3. **树太枯燥**：只有静态名录，缺少可读的谱系视图、亲缘解释和可追溯的家族叙事。

本系统用 AI 辅助解决上述问题，但 AI 只做“抽取建议、校验提示、查询解释、叙事草稿”，**所有正式家谱事实必须由人确认**。

## 1.2 目标用户与角色

| 角色 | 定位 | 主要诉求 |
|---|---|---|
| ADMIN 管理员 | 家族数据负责人 / 系统维护者 | 用户管理、全量数据、最终审核、导出与审计 |
| EDITOR 编辑 | 家谱整理者 | 录入与修改人物/关系/事件、导入老谱、接受 AI 草稿、发起合并/删除 |
| REVIEWER 审核 | 宗族长辈 / 数据校对者 | 只读全量数据，批准或驳回合并、删除等高风险操作，查看审计 |
| VIEWER 族亲 | 普通家族成员 | 浏览家谱树、查询亲缘；在世人物信息默认遮罩；无叙事权限 |

系统为**单家族使用**设计：数据库保留 `familyId` 作用域，界面只维护一个家族，不提供多家族切换。预计总人数 ≤ 10,000，无高并发要求。

## 1.3 MVP 范围（本期必须交付）

| 能力 | 范围说明 | 对应 WBS |
|---|---|---|
| 账号与权限 | 本地账号、httpOnly Cookie + JWT、四角色 RBAC、禁用账号 | 1.1 / 2.1 |
| 人物 / 关系 / 事件 / 来源 CRUD | 部分日期、别名、世代、支系、关系类型与确定性、字段级来源引用 | 1.2 / 2.2 / 3.1–3.2 |
| 家谱树 | 祖先/后代/全谱视图、深度控制、缩放/定位、节点详情、树内快捷编辑、PNG 导出 | 1.3 / 2.3.1 |
| 老谱文本导入 | 图片/文本来源上传、人工转写（图片并排对照）、文本抽取 | 1.4 / 2.4 |
| AI 抽取草稿 | 人物/关系/事件草稿、source_quote、confidence、低置信标记、逐条/批量人工确认 | 1.4 / 2.4 / 3.3 |
| 一致性检查 | 年龄、日期、性别角色、多亲、环、重复、世代、来源缺失等规则；忽略/解决留痕 | 1.5 / 3.4 |
| 自然语言亲缘查询 | “A 和 B 是什么关系”，姓名消歧、路径展示、中文称谓、来源引用 | 1.5 / 2.3 |
| 叙事生成 | 仅使用有来源的事实包，逐句 factRefs，确认后导出 Markdown/HTML（带脚注） | 1.6 / 2.4.4 |
| GEDCOM 5.5.1 | 导入预览/映射确认/幂等提交；导出（在世者脱敏）与往返测试 | 1.6 / 2.5 / 3.3 |
| 协作审核 | 合并人物、删除人物/关系走审核；差异对比；乐观锁版本控制 | 1.7 / 2.6 / 2.2.4 |
| 隐私脱敏 | 在世默认私有；按角色响应过滤；导出/分享自动脱敏；第三方 AI 调用前脱敏 | 2.7 / 3.5 |
| 审计 | 全部写操作与高风险动作留痕；审计日志不可修改/删除 | 1.7 / 2.6 / 3.5 |

## 1.4 明确不在本期范围（非目标）

- 自动 OCR / 手写识别 / 版面分析：图片只作为来源与人工转写底稿，**不承诺自动识别文字**。
- 自动合并人物或自动接受 AI 草稿：任何情况下都不提供该开关。
- 多家族切换、按支系分配细粒度权限、实时协同编辑（WebSocket）、在线评论。
- GEDCOM 7.0、ANSEL 编码、完整 SOUR/NOTE 引用结构的高保真导入导出。
- 农历/公历换算、朝代年号自动换算；仅保存原文与人工填写的公历近似值。
- 家谱印刷排版、族谱地图、相册、DNA 数据、第三方登录、云端同步、移动端适配。
- Docker、MySQL、Redis、消息队列、微服务、搜索中间件。

## 1.5 五项不可协商原则与落地机制

| 原则 | 系统机制 | 可验证方式 |
|---|---|---|
| P1 AI 只生成建议 | AI 模块只有写 `AiJob` / `AiDraft` / `Narrative(DRAFT)` 的权限；接受草稿走独立事务，写正式表并记审计；不存在自动接受 | 抽取后人物数量不变；必须调用 `accept` 才新增；代码检查 AI 模块无 `Person.create/update` |
| P2 抽取必须可验证 | 每条草稿强制 `sourceQuote` + `confidence`；服务端校验引文是来源原文子串；姓名/日期/地点必须出现在引文中；无依据字段留空；无效引文禁止接受 | 单元测试覆盖伪造引文、字段不在引文、空置信度；UI 接受按钮在无效时禁用 |
| P3 隐私默认安全 | 无死亡事实默认在世；VIEWER 与导出/分享自动遮罩；第三方 AI 先经脱敏网关并展示预览；原图/完整姓名/联系方式不出境 | 四角色响应快照测试；导出文件扫描；AI 请求体断言不含在世者完整姓名；脱敏预览为强制步骤 |
| P4 叙事逐句可追溯 | 只有带来源的事实进入事实包；模型只输出 `text + factRefs`；服务端解析引用；无有效 factRef 的句子不能确认/导出 | 叙事校验器测试；导出文件含脚注；删除来源引用后句子被标记 |
| P5 高风险操作审计 | 合并/删除必须提交审核并由他人或管理员二次确认；事务内校验版本；审计日志只追加，DB 触发器禁止更新/删除 | 审核流集成测试；审计不可变测试；合并后关系重指向与快照校验 |

## 1.6 核心用户流程

### 流程 A：老谱导入 → AI 草稿 → 人工确认

1. 编辑上传老谱图片或粘贴文本，建立 `Source`；图片录入以人工转写为准，界面并排显示原图与转写框。
2. 点击“AI 抽取”，系统展示**脱敏预览**（在世者姓名、联系方式、住址、精确日期替换为占位符），编辑可追加屏蔽词，确认后才调用第三方 AI；Mock Provider 不产生外部请求，但同样经历确认流程。
3. 任务进入队列（同步调用 + 轮询状态），服务端校验模型输出 Schema、引文子串、字段依据与置信度，生成逐条 `AiDraft`。
4. 在草稿工作台逐条核对：原文引文、置信度、字段编辑、重复候选；“接受”才写入正式档案并自动创建字段来源引用；“拒绝”只改草稿状态。
5. 批量接受必须二次确认，逐条记录审计；任何失败项与依赖跳过项都会列出原因。

### 流程 B：日常编辑 → 一致性校验

1. 编辑人物、父母/配偶关系、事件与来源。
2. 保存时执行结构性校验（自环、性别角色、重复配偶、版本冲突）；复杂规则通过“运行校验”统一检测。
3. 校验中心展示 ERROR/WARNING/INFO，可跳转实体、忽略（必须填理由）或标记已解决；重复运行不产生重复问题。
4. 疑似重复人物只给出候选与合并入口，不自动合并。

### 流程 C：亲缘查询 → 家谱树 → 叙事

1. 在查询框输入“张德明和李秀英是什么关系”。
2. 系统解析两个人名，若同名给出候选让用户选择；随后在关系图上计算最短路径，输出中文称谓、逐跳路径、存疑边提示与来源引用。
3. 用户可一键在树中定位两人，查看共同祖先。
4. 选择人物生成叙事：系统先构建“有来源事实包”，AI 组织语言；每句展示引用，编辑修改并逐句核对后确认，导出带脚注的 Markdown/HTML。

### 流程 D：协作与导出

1. EDITOR 发起合并人物或删除人物/关系，填写理由；系统生成差异预览与待审请求。
2. REVIEWER/ADMIN 查看差异，批准后事务执行；若数据版本已变化则返回 409，要求重新预览。
3. 导出 GEDCOM 前显示脱敏摘要（将在世人数、遮罩字段），确认后生成文件并记审计；所有导出强制遮罩在世者。

## 1.7 非功能需求

| 编号 | 要求 | 验收方式 |
|---|---|---|
| NFR-01 | 本地启动无需 Docker、MySQL、Java、Maven；只依赖 Node.js 与 npm | 空目录按 README 4 条命令跑通 |
| NFR-02 | 10,000 人物规模下，人物列表查询 P95 < 300ms；1,000 节点家谱树首屏 < 2s（本地开发机） | 压测脚本/种子基准 |
| NFR-03 | 所有写操作、登录、AI 任务、导出、审核、合并、删除均写审计 | 审计动作清单测试 |
| NFR-04 | AI 无直接写正式事实的代码路径 | 代码审查 + 抽取前后数量断言 |
| NFR-05 | 所有导出与分享自动遮罩在世者；无“关闭遮罩”选项 | 导出文件断言 + UI 无相关开关 |
| NFR-06 | 测试不依赖外网；AI 测试使用 Mock/本地假服务器 | `npm test` 离线通过 |
| NFR-07 | 生产模式单进程：Express 同时提供 API 与前端静态资源；同源 Cookie | `npm run build && npm start` 验证 |
| NFR-08 | SQLite 单文件可备份/恢复；上传目录一并备份 | 备份脚本集成测试 |
| NFR-09 | 中文界面、UTF-8、保留繁体原文；日期“年/月/日”可缺省 | 界面走查 + 单元测试 |
| NFR-10 | 密码哈希、登录限流、上传白名单、路径穿越防护、XSS/注入防护 | 安全测试清单 |
| NFR-11 | TypeScript `strict` 全量通过；ESLint 无错误 | CI 本地脚本 |
| NFR-12 | 数据删除为软删除（人物）或审批后物理删除（关系，审计保留快照）；可追溯 | 数据生命周期测试 |

## 1.8 术语

| 术语 | 定义 |
|---|---|
| 事实 | 人物字段、人物间关系、事件等可被引用/校验的数据 |
| 来源 Source | 家谱图片、文本、口述、碑刻等原始材料 |
| 引用 Citation | 将来源中的一段引文绑定到某个字段/关系/事件 |
| 草稿 AiDraft | AI 输出、尚未写入正式事实的候选记录 |
| 事实包 | 叙事生成时提供给模型的有来源事实集合 |
| factRef | 叙事句子引用的 factId，由服务端映射为真实数据与来源 |
| 部分日期 | 年/月/日可空，带原文、精度与“约值”标记的日期 |
| 在世遮罩 | 对在世者姓名、精确日期、地点、照片、传记等按规则脱敏 |
| 审核请求 ReviewRequest | 合并/删除等高风险操作的人工审批单 |
| 审计快照 | 操作前后实体 JSON，仅 ADMIN/REVIEWER 可查 |

## 1.9 运行环境探测结果（2026-10-21）

| 项目 | 探测结果 | 结论 |
|---|---|---|
| Node.js | v24.21.0 | 满足 |
| npm | 11.19.0 | 满足 |
| Python | 3.14.4 | 不使用（较新版本对部分库有兼容风险） |
| Java | 19.0.2 | 不使用 |
| Maven | 未安装 | 排除 Spring Boot 方案 |
| MySQL | 8.0.46 已安装（未使用） | 无高并发需求，SQLite 更少组件 |
| Docker | 未探测/不使用 | 不引入 |
| Ollama | 未安装 | 不使用本地模型 |
| AI Key | 环境变量未设置 | 必须支持 Mock 离线演示 |
| 工作区路径 | `C:\Users\jt200\Desktop\qoder cn`（含空格） | 脚本使用相对路径与规范引号 |

---

# 2. 设计方案

## 2.1 技术选型与理由

| 层 | 选型 | 理由 | 未采用的方案 |
|---|---|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + Ant Design 5 + React Flow 12 + dagre + TanStack Query 5 + Zustand + Axios + dayjs + html-to-image | 表单/表格成熟；React Flow 适合谱系图；html-to-image 用于树画布 PNG 导出（纯前端、无服务端渲染依赖） | Vue3：也能做，但 React Flow 的谱系交互生态更直接；项目已确认 Node 全栈；html2canvas 体积更大且 CSS 兼容性更差 |
| 后端 | Node.js 24 + TypeScript + Express 4 + Prisma 6 + SQLite | 与前端同语言；Prisma 迁移与类型安全；SQLite 零服务 | Spring Boot：需 Maven/更多组件；FastAPI：Python 3.14 兼容风险且前端仍需 Node |
| 数据库 | SQLite（WAL 模式） | 单家族、无高并发、单文件备份、迁移云服务器方便 | MySQL：可用但多一个服务与配置，不满足“组件最少” |
| 认证 | httpOnly Cookie + JWT（HS256）+ bcryptjs | 避免 localStorage 令牌被 XSS 读取；同源部署简单 | localStorage JWT：XSS 风险更高；OAuth：MVP 不需要 |
| AI | Provider 抽象：OpenAI 兼容 HTTP + Mock | 可接 DeepSeek/通义/Kimi 等；无 Key 也能完整演示 | 本地 Ollama：需下载数 GB 模型；仅云端：断网无法演示 |
| 测试 | Vitest + Supertest + 临时 SQLite | 与 Vite/TS 同栈；API 集成测试直接 | Playwright：MVP 用组件测试 + 手工端到端脚本，避免浏览器安装负担 |

**版本策略**：使用上述大版本的最新稳定小版本，提交 `package-lock.json` 固定实际版本；升级需单独工作包授权。

## 2.2 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│ 浏览器（React SPA, AntD, React Flow）                        │
│ 登录 / 人物 / 树 / AI 导入 / 校验 / 亲缘 / 叙事 / 审核 / 审计  │
└───────────────┬─────────────────────────────────────────────┘
                │ 同源 HTTPS / 开发代理，httpOnly Cookie
┌───────────────▼─────────────────────────────────────────────┐
│ Express API (/api/v1)                                        │
│ 认证/RBAC → zod 校验 → 业务服务 → 隐私呈现 → 审计            │
│ 人物·关系·事件·来源 │ 树/亲缘 │ AI 网关 │ 校验 │ GEDCOM      │
│ 审核/合并 │ 叙事 │ 导出 │ 用户管理                            │
└───────┬───────────────────────┬─────────────────────────────┘
        │ Prisma                │ 本地文件
┌───────▼────────┐      ┌───────▼──────────────┐
│ SQLite 单文件   │      │ data/uploads（鉴权流式）│
│ WAL / FK / 索引 │      │ 备份到 data/backups     │
└────────────────┘      └──────────────────────┘
        │
        │ 仅在用户确认脱敏预览后，HTTPS 调用
┌───────▼─────────────────────────────────────┐
│ 第三方 AI（OpenAI 兼容）或内置 Mock Provider │
└─────────────────────────────────────────────┘
```

**关键边界**：

- 浏览器永远不接触 AI API Key；所有 AI 调用在服务端。
- 图片文件只经鉴权接口流式返回，不暴露静态目录。
- AI 抽取请求只发送脱敏文本；模型返回先落草稿，不能直接写正式表。
- 所有对外导出（GEDCOM/叙事/树图片）走统一脱敏策略并审计。

## 2.3 目录结构

```text
genealogy-ai/
├─ .qoder/rules/genealogy-ai.md        # 项目硬规则
├─ specs/ai-genealogy-spec.md          # 本 Spec（唯一事实来源）
├─ docs/                               # ER 图、数据字典、API 清单、演示脚本
├─ shared/                             # 前后端共享（TS 源码）
│  ├─ src/types.ts                     # DTO 与领域类型
│  ├─ src/constants/                   # 角色、规则码、敏感级别、权限矩阵
│  ├─ src/schemas/                     # zod 请求/响应 Schema
│  └─ src/utils/date.ts                # 部分日期与年龄边界
├─ server/
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/
│  │  └─ seed.ts
│  ├─ src/
│  │  ├─ main.ts / app.ts
│  │  ├─ config/env.ts
│  │  ├─ lib/                          # prisma、错误、HTTP、日志、GEDCOM、加密工具
│  │  ├─ middleware/                   # auth、rbac、validate、security、error
│  │  ├─ modules/                      # auth users persons relations events sources
│  │  │                                # tree ai checks kinship gedcom narratives reviews audit dashboard
│  │  └─ services/                     # privacy ai checks kinship gedcom merge audit
│  ├─ tests/                           # 集成测试与夹具
│  └─ tsconfig.json
├─ web/
│  ├─ index.html / vite.config.ts
│  └─ src/
│     ├─ main.tsx / App.tsx / router.tsx
│     ├─ api/                          # Axios 客户端与端点函数
│     ├─ stores/                       # auth、UI
│     ├─ components/                   # PersonForm、DraftRow、TreePersonNode、CitationPopover 等
│     ├─ pages/                        # 登录、仪表盘、人物、树、AI 导入、校验、亲缘、叙事、审核、审计、用户
│     └─ styles/
├─ scripts/                            # backup.ts、reset-demo.ts、smoke.ts
├─ data/                               # genealogy.db、uploads、backups（gitignore）
├─ .env.example
├─ package.json                        # 单包，单 lockfile
├─ tsconfig.base.json / tsconfig.json
├─ vitest.config.ts
└─ README.md
```

**单体单包策略**：前后端共用一个 `package.json` 与 `node_modules`，共享 TS 源码通过相对路径/别名引用，减少 workspace 配置与构建复杂度。

## 2.4 数据模型

SQLite 不支持数据库原生枚举，Prisma 中统一使用 `String` 存储枚举值，由 `shared/src/constants` + zod 在应用层约束；JSON 载荷使用 `String`（TEXT）存储并经 zod 解析，避免连接器差异。

### 2.4.1 模型总览

| 模型 | 作用 | 关键字段与约束 |
|---|---|---|
| `User` | 账号 | `username` 唯一、`passwordHash`、`displayName`、`role`（ADMIN/EDITOR/REVIEWER/VIEWER）、`isActive`、`lastLoginAt` |
| `Family` | 家族作用域 | `name`、`description`；MVP 只有一行种子数据 |
| `Person` | 人物 | `surname`、`givenName`、`courtesyName`、`alias`、`gender`、`livingStatus`、出生/死亡部分日期与地点、`occupation`、`biography`、`generation`、`branch`、`status`（ACTIVE/MERGED/DELETED）、`mergedIntoId`、`version`、审计字段 |
| `Relation` | 关系 | `type`（PARENT_CHILD/SPOUSE）、`personAId`、`personBId`、`parentRole`、`childKind`、`spouseKind`、`certainty`、`note`、`version`、审计字段；PARENT_CHILD 中 A=父/母、B=子女 |
| `Event` | 事件 | `type`、`personId?`、`relationId?`、部分日期、`place`、`description`、`certainty`；`personId` 与 `relationId` 至少一个 |
| `Source` | 来源 | `type`（IMAGE/TEXT/ORAL/BOOK/TOMBSTONE/GEDCOM）、`title`、`description`、`fileName`、`mimeType`、`sizeBytes`、`fileHash`、`storagePath`、`rawText`、`transcriptionStatus` |
| `Citation` | 字段级引用 | `sourceId`、`targetType`（PERSON/RELATION/EVENT）、`targetId`、`fieldPath`（如 `birth.year`）、`quote`（非空）、`page`、`confidence` |
| `AiJob` | AI 任务 | `kind`（EXTRACT/NARRATIVE/KINSHIP_INTENT）、`sourceId?`、`status`、`provider`、`model`、`promptVersion`、`inputHash`、`maskedInput`、`maskMap`、`outputJson`、`errorMessage`、`statsJson`、起止时间 |
| `AiDraft` | AI 草稿 | `jobId`、`draftType`（PERSON/RELATION/EVENT）、`tempId`、`payloadJson`、`sourceQuote`、`confidence`、`warningsJson`、`status`（PENDING/ACCEPTED/REJECTED）、`reviewedBy/At`、`appliedEntityType/Id` |
| `Narrative` | 叙事 | `subjectPersonId`、`title`、`paramsJson`、`contentJson`、`status`（DRAFT/CONFIRMED）、`createdBy`、`confirmedBy/At`、`version` |
| `ConsistencyIssue` | 校验问题 | `code`、`severity`、`entityType`、`entityId`、`message`、`detailsJson`、`dedupeKey` 唯一、`status`（OPEN/IGNORED/RESOLVED）、忽略理由/操作人/时间、首次/最近发现时间 |
| `ReviewRequest` | 审核请求 | `action`（MERGE_PERSON/DELETE_PERSON/DELETE_RELATION）、`payloadJson`、`diffJson`、`status`（PENDING/APPROVED/REJECTED/CANCELLED）、`requestedBy`、`decidedBy`、`decisionComment`、`expectedVersionsJson`、时间 |
| `AuditLog` | 审计 | `actorId`、`actorRole`、`action`、`entityType`、`entityId`、`beforeJson`、`afterJson`、`reason`、`ip`、`userAgent`、`requestId`、`createdAt`；只追加 |
| `GedcomImport` | GEDCOM 批次 | `sourceId`、`status`（PARSED/PREVIEWED/COMMITTED/FAILED/CANCELLED）、`fileHash`、`previewJson`、`mappingJson`、`statsJson`、`errorMessage`、提交人/时间 |
| `GedcomXref` | GEDCOM 标识映射 | `importId`、`xref`、`entityType`、`entityId`；用于幂等与往返 |

### 2.4.2 关键约束

- `Person`：`familyId + status` 索引；姓名/别名模糊检索走 `contains`；`version` 每次修改 +1；删除为 `status=DELETED` 软删除；合并后 `status=MERGED, mergedIntoId=保留者`。
- `Relation`：同一对人物同类型最多一条有效记录（服务层事务校验）；SPOUSE 以 `personAId < personBId` 规范化，防止反向重复；PARENT_CHILD 方向固定；禁止自环、亲子环；删除关系在审核通过后物理删除，审计保留完整快照。
- `Event`：`CHECK (person_id IS NOT NULL OR relation_id IS NOT NULL)` 由应用层保证；婚姻/离婚事件可挂 `relationId`。
- `Citation.quote` 非空；删除人物时引用保留（软删除），删除关系时先删除其引用并记入审计快照。
- `AiDraft`：接受后不可再次接受；`sourceQuote` 与 `confidence` 必填；`payloadJson` 经 zod 校验。
- `Narrative.contentJson`：`sections[].sentences[]`，每句 `{ id, text, factRefs[] }`；引用由服务端附加，不存模型返回的伪引用。
- `ConsistencyIssue.dedupeKey` 唯一，避免重复问题；忽略需理由。
- `AuditLog`：通过 SQLite 触发器禁止 `UPDATE`/`DELETE`；仅提供查询与导出。
- 所有人身敏感字段不做数据库加密（本地单机），但通过 API 序列化与文件访问控制脱敏；备份文件被视为敏感资产。
- 软删除人物默认不出现在列表/树/查询中；审计与合并追溯可查。

## 2.5 部分日期与不确定信息

```ts
type PartialDate = {
  year: number | null;
  month: number | null;
  day: number | null;
  dateText: string | null;      // 原文，如“光绪二十八年”“约民国十年”
  precision: 'YEAR' | 'MONTH' | 'DAY' | 'UNKNOWN';
  approximate: boolean;          // ABT/BEF/AFT/约/前后
  calendar: 'SOLAR' | 'LUNAR' | 'UNKNOWN';
};
```

规则：

- 展示优先原文 `dateText`；有公历年时同时显示“约 1902 年”。
- 年龄/时间校验只在可推导边界时执行；`approximate` 的违规降一级（ERROR → WARNING），并在问题详情标注“日期为约值”。
- 只有年份时，月日为空；禁止用 1 月 1 日填充。
- 导入 GEDCOM 的 `ABT/BEF/AFT/BET...AND/FROM...TO` 转为 `approximate=true` + 原文；无法解析的日期保留原文、`precision=UNKNOWN` 并生成导入警告。
- 死亡事实（死亡日期/死亡事件）存在时，由用户确认后将 `livingStatus` 改为 DECEASED；未确认前仍按默认规则处理。不得仅凭年龄推断死亡。

## 2.6 隐私、角色与脱敏设计

### 2.6.1 在世判定

| 场景 | 默认值 |
|---|---|
| 新建人物，未填死亡日期/死亡事件 | `LIVING` |
| 新建人物，明确填写死亡日期或死亡事件 | `DECEASED`（保存前弹窗确认） |
| 导入 GEDCOM 有 DEAT | `DECEASED`；预览显示数量 |
| 导入 GEDCOM 无 DEAT | `LIVING`；预览警告“未提供死亡信息，按在世处理” |
| 状态未知 | `UNKNOWN`，按 `LIVING` 遮罩 |

将人物从“在世”改为“已故”会解除遮罩，属于敏感变更：保存前必须二次确认并填写依据；写审计。反向变更同样审计。

### 2.6.2 敏感级别

| 级别 | 内容 | 示例 |
|---|---|---|
| L0 公开 | 已故者姓名、性别、世代、支系、亲缘结构、生卒年份 | 张德明（1902–1978） |
| L1 家族 | 已故者精确日期、地点、传记、事件、来源文件、引文 | 卒于腊月十七，葬于村东 |
| L2 私有 | 在世者完整姓名、精确日期、详细地点、照片、传记、联系方式 | 张伟，1990-05-12，某小区 |
| L3 机密 | 密码哈希、JWT 密钥、AI API Key、出站替换映射、审计 IP、服务器路径 | 不进入任何前端响应 |

### 2.6.3 角色可见性矩阵

| 能力/数据 | ADMIN | EDITOR | REVIEWER | VIEWER |
|---|---|---|---|---|
| 查看已故人物完整信息 | ✓ | ✓ | ✓ | ✓（L0+L1） |
| 查看在世人物完整信息 | ✓ | ✓ | ✓ | ✗（遮罩） |
| 新增/编辑人物、关系、事件、来源 | ✓ | ✓ | ✗ | ✗ |
| 接受/拒绝 AI 草稿 | ✓ | ✓ | ✗ | ✗ |
| 运行一致性检查 | ✓ | ✓ | ✓ | ✗（仅树徽标，无详情） |
| 亲缘查询 | ✓ | ✓ | ✓ | ✓（按遮罩展示） |
| 生成叙事 | ✓ | ✓ | ✗ | ✗ |
| 查看叙事 | ✓ | ✓ | ✓ | ✗ |
| 发起合并/删除 | ✓ | ✓ | ✗ | ✗ |
| 审批合并/删除 | ✓（需二次确认+理由） | ✗ | ✓ | ✗ |
| GEDCOM 导入 | ✓ | ✓ | ✗ | ✗ |
| GEDCOM/叙事导出 | ✓ | ✓ | ✓（仅遮罩导出） | ✗ |
| 用户管理 | ✓ | ✗ | ✗ | ✗ |
| 查看审计日志 | ✓ | ✗ | ✓ | ✗ |
| 访问来源原文件 | ✓ | ✓ | ✓ | ✗（引文按实体脱敏） |

### 2.6.4 遮罩规则

| 字段 | 在世（VIEWER/导出） | 已故（VIEWER） |
|---|---|---|
| 姓名 | 保留首字，其余替换为 `*`（最多 3 个）；单字姓名显示 `*` | 完整 |
| 出生/死亡日期 | 仅年份；无年份显示“未公开”；约值前缀“约” | 按原文/完整 |
| 地点 | 截断到省/市或县，不含村镇门牌 | 完整 |
| 传记/备注 | 不返回 | 返回（联系方式正则脱敏） |
| 照片/来源原图 | 不返回文件 | 按来源权限返回 |
| 引文 | 不返回该人物/关系/事件的引文 | 返回，联系方式正则脱敏 |
| 关系结构 | 返回（用于谱系理解），节点名遮罩 | 完整 |
| 叙事 | 不返回 | 不返回（VIEWER 无叙事权限） |

实现方式：所有响应必须经过 `presentPerson/presentRelation/presentEvent/presentCitation` 呈现层，禁止在路由中直接返回 Prisma 实体；对响应做快照测试，断言 VIEWER JSON 不含电话、完整姓名、精确日期、文件路径。

### 2.6.5 导出与调用第三方 AI 的脱敏

- **GEDCOM/叙事/树图片导出**：统一经过 `ExportPolicy`；在世者强制遮罩；文件页首/NOTE 写明“在世人物已脱敏”；导出需要 `acknowledgeMasking=true` 并写审计；不提供关闭遮罩参数。
- **第三方 AI 出站**：
  1. 从来源文本中识别数据库中已知的在世人物姓名/别名（最长优先）→ `【L1】`…占位符；
  2. 正则屏蔽手机号、身份证号、邮箱、详细住址、社交账号；
  3. 已知在世者的精确生卒日期 → `【L1-DATE】`；
  4. 生成脱敏预览，列出替换项；编辑可追加屏蔽词；服务端重新脱敏；
  5. 用户确认后才调用；`AiJob` 保存脱敏文本、输入哈希与替换映射（映射仅 ADMIN 可查，任务完成后 7 天清空）；
  6. 模型返回先还原占位符，再生成草稿；普通日志只记录任务 ID 与哈希，不记录脱敏映射或原文。
- **Mock Provider**：不产生外部请求，但仍走“预览→确认”，UI 标注“Mock（无外部调用）”。

## 2.7 AI 子系统设计

### 2.7.1 Provider 抽象

```ts
interface AiProvider {
  name: 'openai-compatible' | 'mock';
  extract(input: ExtractInput): Promise<ExtractOutput>;
  narrate(input: NarrativeInput): Promise<NarrativeOutput>;
  parseKinshipIntent(input: KinshipIntentInput): Promise<KinshipIntentOutput>;
}
```

- `OpenAiCompatibleProvider`：`POST {AI_BASE_URL}/chat/completions`，`temperature=0.2`，JSON 模式（如供应商支持）或严格提示词 + 解析；超时 60s；网络错误重试 1 次；记录状态码与耗时，不记录密钥。
- `MockProvider`：
  - EXTRACT：仅匹配内置示例文本（规范化后哈希匹配），返回固定、校验通过的草稿；不匹配时返回空结果与警告“Mock 未匹配示例，未生成草稿”，绝不凭空编造。
  - NARRATIVE：根据事实包用模板生成逐句 factRefs。
  - KINSHIP_INTENT：正则解析“A 和 B 是什么关系”等句式。
- 环境变量：`AI_PROVIDER=mock|openai`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`AI_TIMEOUT_MS`；缺少 Key 时启动仍成功，AI 页面提示切换 Mock。

### 2.7.2 抽取数据契约

模型必须返回：

```json
{
  "persons": [
    {
      "tempId": "P1",
      "surname": "张",
      "givenName": "德明",
      "gender": "MALE",
      "birthDate": { "year": 1902, "month": null, "day": null, "dateText": "光绪二十八年", "precision": "YEAR", "approximate": true, "calendar": "LUNAR" },
      "birthPlace": "山东济南",
      "deathDate": null,
      "deathPlace": null,
      "livingStatus": "UNKNOWN",
      "occupation": null,
      "sourceQuote": "德明公，光绪二十八年生",
      "confidence": 0.86
    }
  ],
  "relations": [
    {
      "tempId": "R1",
      "type": "PARENT_CHILD",
      "parentTempId": "P1",
      "childTempId": "P2",
      "parentRole": "FATHER",
      "childKind": "BIOLOGICAL",
      "sourceQuote": "德明公生子二：长文山",
      "confidence": 0.82
    }
  ],
  "events": [],
  "warnings": ["生卒月份不详"]
}
```

服务端校验步骤（按顺序）：

1. zod 结构校验，拒绝未知枚举、超长文本；
2. `sourceQuote` 非空且为来源 `rawText`（空白规范化后）的子串，否则草稿标记 `QUOTE_NOT_FOUND`、`confidence=0`、禁止接受；
3. 对姓名、日期、地点做“值必须出现在引文中”的轻量校验；不通过标记 `FIELD_NOT_IN_QUOTE`，禁止直接接受（允许人工改值/改引文后重新校验）；
4. `confidence` 截断到 `[0,1]`，缺失则视为无效；
5. 关系端点必须是本批次人物 tempId；不存在的端点丢弃并记警告；
6. 每条草稿独立落库，原始输出保留在 `AiJob.outputJson` 以便追溯；
7. 低置信度阈值：`<0.6` 红色“低置信”，`0.6–0.8` 黄色“需核对”，`>0.8` 绿色（仍不可自动接受）。

### 2.7.3 草稿接受流程

- 接受时允许修改字段值；重新执行引文/字段校验；不通过则返回 `FIELD_NOT_IN_QUOTE` 或 `QUOTE_NOT_FOUND`。
- 人员草稿支持两种落地：新建人物，或“关联到已有人员”（仅补来源引用，不覆盖字段）；后者必须先由用户显式选择并确认。
- 依赖顺序：人员 → 关系 → 事件；同一批次内 `tempId` 映射到新建 ID 或已有关联 ID；端点被拒绝或未映射的关系/事件跳过，并返回原因清单。
- 每个接受项在独立事务中创建实体 + `Citation` + `AuditLog`（`AI_DRAFT_ACCEPT`）；批量接受逐项提交并汇总，不做全局回滚，避免一个失败拖垮整批。
- 接受后 `AiDraft.status=ACCEPTED`、记录 `appliedEntityType/Id`；不可重复接受；拒绝需可选理由并写审计。
- 不存在“自动接受任何置信度”的接口或配置。

### 2.7.4 叙事生成

1. 构建事实包：仅纳入**至少有一条 Citation** 的字段/关系/事件；无来源的事实被排除，并返回 `excludedFacts`（字段标签 + 原因）供 UI 展示。
2. 事实形如：`{ factId: "F-001", entityType, entityId, fieldPath, label, value, citations[] }`。
3. 模型输出结构：

```json
{
  "title": "张德明小传",
  "sections": [
    {
      "title": "早年",
      "sentences": [
        { "text": "张德明于约1902年出生于山东济南。", "factRefs": ["F-001", "F-002"] }
      ]
    }
  ]
}
```

4. 服务端校验：每个 factRef 必须属于事实包；每句至少一个 factRef；引用由服务端解析并附加；缺引用的句子标记 `MISSING_FACT_REF` 且不能确认。
5. 辅助核对：句中出现的人名/年份若不在所引用事实的值中，标记 `UNVERIFIED_MENTION` 警告；确认前需编辑或勾选“已人工核对”。该警告不自动删除句子，但会阻止“全部通过”的默认确认。
6. 叙事状态：DRAFT →（人工确认）→ CONFIRMED；已确认只读；重新生成产生新记录；导出仅限 CONFIRMED。
7. 导出 Markdown/HTML：每个来源生成脚注，句子后标注 `[1][2]`；HTML 对全部文本转义。

### 2.7.5 AI 任务治理

- `AiJob` 状态：PENDING → RUNNING → SUCCEEDED / FAILED；超时/网络错误记录错误并允许重试（新任务，不覆盖历史）。
- 所有 Prompt 存放在 `server/src/modules/ai/prompts/`，带 `PROMPT_VERSION`；每条草稿记录任务与版本，便于追溯。
- 输入哈希用于识别重复抽取；重复任务给出提示，但允许用户明确重跑。
- Token/长度上限：来源文本超过 20,000 字符时要求分段抽取；MVP 按段落分段，每段一个任务，结果汇总到同一来源。

## 2.8 一致性校验规则

所有规则只读，不修改数据；每次运行对比上次结果，未再出现的问题自动标记 RESOLVED（`resolvedBy=SYSTEM`，理由“复检未再出现”），已 IGNORE 的问题保持忽略。

| 码 | 严重级 | 规则 | 条件说明 |
|---|---|---|---|
| E-DATE-001 | ERROR | 死亡早于出生 | 两人日期均可比较且死亡 < 出生 |
| E-DATE-002 | ERROR | 出生晚于今天 | 出生日期 > 当前日期 |
| E-DATE-003 | ERROR | 婚姻事件早于任一方出生 | 关联婚姻事件日期 < 任一方出生日期 |
| E-DATE-004 | ERROR | 婚姻事件晚于任一方死亡 | 关联婚姻事件日期 > 任一方死亡日期 |
| E-REL-001 | ERROR | 自我关系 | personAId == personBId |
| E-REL-002 | ERROR | 亲子环 | 沿 PARENT_CHILD 向上可回到自身 |
| E-REL-003 | ERROR | 多个生父/生母 | 同一子女存在 >1 条 BIOLOGICAL 父亲或母亲 |
| E-REL-004 | ERROR | 父母角色与性别冲突 | 父亲为 FEMALE 或母亲为 MALE |
| E-REL-005 | ERROR | 悬空关系 | 关系端点人物不存在或已删除 |
| E-AGE-001 | ERROR | 父母年龄过小 | 确切日期下父/母 < 12 岁；约值降为 WARNING |
| W-AGE-002 | WARNING | 父母年龄异常 | 父 < 16 或 > 75；母 < 14 或 > 60 |
| E-AGE-003 | ERROR | 母亲死亡后出生 / 父亲死亡超 300 天后出生 | 时间可比较且超出生理边界 |
| W-AGE-004 | WARNING | 遗腹子提示 | 父亲死亡至出生 0–300 天，提示核对 |
| W-MAR-001 | WARNING | 重复配偶关系 | 同一对人物存在多条有效 SPOUSE |
| W-GEN-001 | WARNING | 世代不连续 | 双方世代均已填且子女 ≠ 父母 + 1 |
| W-DUP-001 | WARNING | 疑似重复人物 | 同名 + 出生年 ±1 + 共同父母；或姓名相似度 ≥ 0.88 且同世代同支系 |
| I-SRC-001 | INFO | 事实缺少来源 | 人物有出生/死亡/关系等事实但无任何 Citation；每人最多一条 |
| W-LIV-001 | WARNING | 在世状态冲突 | DECEASED 无死亡事实，或 LIVING 存在死亡事实 |

阈值、严重级集中在 `shared/src/constants/checks.ts`，不得散落在代码中。重复人物只生成候选，合并必须人工发起并审核。

## 2.9 亲缘计算与自然语言查询

### 2.9.1 关系图语义

- 节点：有效人物（`status=ACTIVE`）。
- 边：
  - 亲子边：方向为父/母 → 子女，遍历时双向可用；边标签记录父/母角色、亲生/收养、确定性。
  - 配偶边：无方向；标签记录婚姻/伴侣、确定性、婚姻事件引用。
- 边权：`CERTAIN=1`、`PROBABLE=2`、`DISPUTED=3`；亲子边基础权 1，配偶边基础权 1。BFS 先最小跳数，再最小总权重；同分路径最多返回 3 条备选。

### 2.9.2 中文称谓规则

| 路径模式（从 A 到 B） | 称谓 | 条件 |
|---|---|---|
| 上 1 | 父亲 / 母亲 | 按父/母角色 |
| 上 2（经父） | 爷爷 / 奶奶 | 按性别 |
| 上 2（经母） | 外公 / 外婆 | 按性别 |
| 上 3 | 曾祖父 / 曾祖母 / 外曾祖父 / 外曾祖母 | 按父系/母系与性别 |
| 上 4 及以上 | “N 世祖/祖母（父系/母系）” | 超过 4 代用描述式 |
| 上 1 下 1（同父/母） | 哥哥/弟弟/姐姐/妹妹 | 有出生年可判长幼，否则“兄弟/姐妹（长幼未知）”；仅一方共同 → 同父异母/同母异父 |
| 上 2 下 1 | 伯父/叔父/姑母/舅父/姨母 | 按父系/母系、性别与长幼 |
| 上 1 下 2 | 侄子/侄女 / 外甥/外甥女 | 按性别与父系/母系 |
| 下 1 | 儿子 / 女儿 | 按性别 |
| 下 2 | 孙子/孙女 / 外孙/外孙女 | 按子女性别 |
| 配偶 | 丈夫 / 妻子 | 按性别 |
| 配偶 + 上 1 | 公公/婆婆 / 岳父/岳母 | 按配偶性别 |
| 亲属 + 配偶 | 伯母/婶母/姑父/舅母/姨父等 | 规则表覆盖常见组合 |
| 其他/超出规则 | 描述式路径 | 如“A 的父亲的母亲的兄弟的儿子”，并给出代数差 |

- 长幼判断仅在有出生年且差值 ≥ 1 时使用；出生年相同或缺失时用中性描述，不臆测。
- 所有称谓必须同时返回“路径节点 + 每跳关系 + 确定性 + 引用”；存在 PROBABLE/DISPUTED 边时，结论后加“含存疑关系，仅供参考”。
- 搜索深度默认 6，最大 8；超过限制返回“未在 N 代内找到连通关系”，不猜测。

### 2.9.3 自然语言查询流程

1. LLM 仅做意图解析，输出 `{ fromMention, toMention, intent: 'RELATION'|'GENERATION_GAP'|'PATH' }`；Mock 用正则支持“A 和 B 是什么关系 / A 与 B / A 叫 B 什么 / A 和 B 差几辈”。
2. 姓名消歧：按完整姓名、别名精确匹配；0 条时给相似候选（最多 5 条）；多条时返回候选列表让用户选择，**不自动选第一个**。
3. 图上计算路径；答案用服务端模板生成，不让 LLM 自由发挥；LLM 只负责把自然语言问题转成结构化意图。
4. 响应包含：`answer`、`kinshipTerm`、`paths[]`（节点、边、确定性）、`citations[]`、`ambiguousCandidates[]`、`truncated`。
5. VIEWER 的返回按 2.6.4 遮罩；引用按实体权限过滤。
6. 页面提供示例问题与“在树中查看”入口。

## 2.10 GEDCOM 5.5.1 导入导出

### 2.10.1 支持范围

- 编码：UTF-8（含 BOM）；其他编码（ANSEL 等）明确报错，不猜测转码。
- 行结构：`level [xref] tag [value]`；支持 `CONT`、`CONC`；兼容 CRLF/LF；忽略未知标签但记录警告。
- 导入：`INDI` 的 `NAME`、`SEX`、`BIRT/DEAT` 的 `DATE/PLAC`、`OCCU`、`NOTE`；`FAM` 的 `HUSB/WIFE/CHIL`、`MARR/DIV` 的 `DATE/PLAC`；来源以整份 GEDCOM 文件建立一个 `Source`，导入实体按原始行生成 Citation（引文为对应原始行，含行号）。
- 导出：`HEAD`（`GEDC VERS 5.5.1`、`CHAR UTF-8`、隐私说明 NOTE）、`INDI`（`NAME/SEX/BIRT/DEAT/OCCU/NOTE/FAMC/FAMS`）、`FAM`（`HUSB/WIFE/CHIL/MARR/DIV`）、来源信息以 NOTE 形式保留标题。
- 不支持：完整 `SOUR`/`REPO` 引用结构、多媒体 `OBJE`、`ASSO`、LDS 等扩展；导入时列为警告，不静默丢弃。

### 2.10.2 导入流程

1. 上传 `.ged`（≤10MB），计算 SHA-256；同文件已成功导入则阻止并提示，避免重复建人。
2. 解析为预览：人物数、家庭数、关系数、事件数、重复姓名候选、缺失 xref、日期/编码/标签警告；**不写正式表**。
3. 映射确认：姓氏拆分规则（`张 /德明/` 或 `德明 /张/`）、无死亡信息者的在世默认（按 LIVING，可改 UNKNOWN）、是否导入 NOTE/来源行。
4. 用户二次确认后事务提交：创建 Source、人物、配偶/亲子关系、事件、Citation、`GedcomXref`，写审计；失败整体回滚。
5. 预览和提交结果保留在 `GedcomImport`；允许取消预览，不允许“部分提交”。

### 2.10.3 导出与脱敏

- 人物导出前经 `ExportPolicy`：在世者姓名遮罩、日期仅年份、地点截断、NOTE 移除；已故者完整。
- FAM 生成算法：先按有效 SPOUSE 关系生成家庭；再为每对共同父母生成/复用 FAM 并挂 CHIL；单亲子女生成只含 HUSB 或 WIFE 的 FAM；未建立配偶关系的共同父母也生成 FAM。确保每个子女恰好出现在一个包含其父母的 FAM 中（父母缺失时允许单亲）。
- xref 使用 `@I{personId}@`、`@F{relationId 或稳定键}@`；导入时记录 `GedcomXref`，保证往返测试可用。
- 导出后自检：重新解析生成文件，检查人物/家庭数量、引用完整性、编码；自检失败则不提供下载并报错。
- 页首 NOTE 固定写明：“Living individuals have been masked by GenealogyAI.”
- 每次导出写 `AuditLog`（范围、数量、遮罩数量、操作人）。

### 2.10.4 往返与限制

- 回归夹具：`server/tests/fixtures/sample-family.ged` 导入 → 导出 → 再导入，断言人物数、关系数、事件数一致；允许日期精度差异在预期清单内。
- 已知损失：来源引用结构、多媒体、事件备注格式、部分非标准日期；在导入报告中明确列出。
- GEDCOM 导入不是 AI 输出，仍需用户在预览页确认后才提交。

## 2.11 家谱树可视化

### 2.11.1 接口语义

- `mode=ancestor`：根节点 + 上溯 depth 代祖先；祖先的配偶作为附带节点展示（不再展开其祖先）。
- `mode=descendant`：根节点 + 下溯 depth 代后代；后代的配偶作为附带节点展示。
- `mode=full`：从根节点出发的连通分量，按 depth 限制；默认 4，最大 8。
- 节点上限 2000；超过时返回 `truncated=true`、每个被截断节点的 `childCount`，前端显示“展开更多”并按分支请求 `GET /tree/branch`。
- 所有节点经隐私呈现层；VIEWER 看到遮罩姓名/年份。

### 2.11.2 交互与布局

- 顶栏：模式、根人物搜索、深度、支系筛选、聚焦、适应画布、PNG 导出。
- 布局：dagre 自顶向下；情侣节点相邻，子女按出生年排序；配偶边虚线；亲子边实线；收养/过继边标注。
- 节点卡片：姓名、生卒（部分日期）、世代/支系、问题徽标（ERROR/WARNING）、来源徽标；点击打开详情抽屉。
- 编辑者可从节点快捷“添加父母/配偶/子女”，预填当前人物并进入关系表单；VIEWER 无编辑入口。
- 大树优化：React Flow 节点/边 memo、仅渲染视口附近节点、布局结果缓存、后端分片；1,000 节点首屏目标 < 2s。
- PNG 导出属于导出行为：需确认遮罩摘要，写审计；VIEWER 无入口。

## 2.12 协作、审核与审计

### 2.12.1 审核请求

| 动作 | 发起人 | 审批人 | 执行内容 |
|---|---|---|---|
| MERGE_PERSON | EDITOR/ADMIN | REVIEWER/ADMIN（ADMIN 自批需二次确认+理由） | 按字段取舍合并人物，重指向关系/引用，源人物标记 MERGED |
| DELETE_PERSON | EDITOR/ADMIN | REVIEWER/ADMIN | 预览影响；软删除人物，关联关系按确认级联物理删除，审计保留快照 |
| DELETE_RELATION | EDITOR/ADMIN | REVIEWER/ADMIN | 物理删除关系及其引用，审计保留快照 |

状态机：`PENDING → APPROVED →（事务执行）` 或 `PENDING → REJECTED`；发起人可 `CANCEL`。审批前校验发起时记录的 `expectedVersionsJson`；任一实体版本变化 → 409 `CONFLICT_VERSION`，要求重新生成预览与请求。审批与执行在同一事务中完成，执行失败则请求保持 PENDING 并记录错误。

### 2.12.2 合并规则

- 选择保留者与来源者；逐字段选择目标值或来源值；空值不覆盖已有值；关系去重后重指向；Citation 去重（同 sourceId + target + fieldPath + quote）后保留；来源者 `status=MERGED`、`mergedIntoId=保留者`。
- 合并前展示：人物字段差异、关系数量变化、引用数量、受影响事件、被去重关系清单。
- 自合并、跨家族合并、已删除/已合并人物合并一律禁止。
- 合并与删除不允许绕过审核直接调用执行 API。

### 2.12.3 乐观锁

- `Person`、`Relation`、`Narrative` 带 `version`；PATCH 必须带当前 `version`，不匹配返回 409 与最新版本数据。
- 审核请求记录预期版本；执行时再次校验。
- 前端收到 409 显示“数据已被他人修改”，提供刷新/重新预览，不自动覆盖。

### 2.12.4 审计动作与不可变性

- 动作：`AUTH_LOGIN`、`AUTH_LOGIN_FAILED`、`AUTH_LOGOUT`、`USER_CREATE/UPDATE/DISABLE`、`PERSON_CREATE/UPDATE/DELETE`、`PERSON_STATUS_CHANGE`、`RELATION_CREATE/UPDATE/DELETE`、`EVENT_CREATE/UPDATE/DELETE`、`SOURCE_CREATE/UPDATE`、`CITATION_CREATE/DELETE`、`AI_JOB_START`、`AI_DRAFT_ACCEPT/REJECT`、`NARRATIVE_CREATE/CONFIRM/EXPORT`、`CHECK_RUN`、`ISSUE_IGNORE/RESOLVE`、`REVIEW_SUBMIT/APPROVE/REJECT/CANCEL`、`MERGE_EXECUTE`、`GEDCOM_IMPORT_COMMIT`、`GEDCOM_EXPORT`、`TREE_EXPORT`、`BACKUP_CREATE`（如通过 UI）、`PRIVACY_ACK`。
- `AuditLog` 只追加；SQLite 触发器阻止 UPDATE/DELETE；应用层不提供修改/删除接口；查询仅 ADMIN/REVIEWER。
- 审计快照可包含敏感数据，因此接口严格限权；普通应用日志对敏感字段 redact。

## 2.13 API 概览

统一前缀 `/api/v1`；响应 `{ code, message, data }`；分页 `{ items, total, page, pageSize }`。角色列表示允许的最低/特定角色。

### 2.13.1 认证与用户

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/auth/login` | 用户名密码登录，设置 httpOnly Cookie | 匿名（限流） |
| POST | `/auth/logout` | 清除 Cookie，写审计 | 登录用户 |
| GET | `/auth/me` | 当前用户与角色 | 登录用户 |
| POST | `/auth/change-password` | 修改自己的密码 | 登录用户 |
| GET | `/users` | 用户列表 | ADMIN |
| POST | `/users` | 新建用户 | ADMIN |
| PATCH | `/users/:id` | 修改角色/显示名/启用状态 | ADMIN |
| POST | `/users/:id/reset-password` | 重置密码 | ADMIN |

### 2.13.2 档案

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/dashboard` | 统计、待办、来源覆盖率 | 所有角色 |
| GET | `/persons` | 分页/关键词/世代/支系/在世筛选 | 所有角色（按角色呈现） |
| POST | `/persons` | 新建人物 | ADMIN/EDITOR |
| GET | `/persons/:id` | 详情（关系、事件、引用、重复候选） | 所有角色 |
| PATCH | `/persons/:id` | 更新（需 version） | ADMIN/EDITOR |
| GET | `/relations` | 按人物/类型查询 | 所有角色 |
| POST | `/relations` | 新建亲子/配偶关系 | ADMIN/EDITOR |
| PATCH | `/relations/:id` | 更新关系（需 version） | ADMIN/EDITOR |
| GET | `/events` | 按人物/关系查询 | 所有角色 |
| POST | `/events` | 新建事件 | ADMIN/EDITOR |
| PATCH | `/events/:id` | 更新事件 | ADMIN/EDITOR |
| DELETE | `/events/:id` | 删除事件（审计） | ADMIN/EDITOR |
| POST | `/sources` | 上传来源（multipart） | ADMIN/EDITOR |
| GET | `/sources` | 来源列表 | 所有角色（VIEWER 可见性受控） |
| GET | `/sources/:id` | 来源详情 | 所有角色（按权限裁剪） |
| GET | `/sources/:id/file` | 鉴权流式文件 | ADMIN/EDITOR/REVIEWER |
| PATCH | `/sources/:id` | 更新标题/转写文本/状态 | ADMIN/EDITOR |
| GET | `/citations` | 按目标查询引用 | 所有角色（按实体遮罩） |
| POST | `/citations` | 新增字段引用 | ADMIN/EDITOR |
| DELETE | `/citations/:id` | 删除引用（审计） | ADMIN/EDITOR |

### 2.13.3 树与亲缘

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/tree` | 祖先/后代/全谱，depth、节点上限 | 所有角色 |
| GET | `/tree/branch` | 分支懒加载 | 所有角色 |
| POST | `/kinship/query` | 自然语言亲缘查询 | 所有角色 |
| GET | `/kinship/between` | 两个 personId 的确定性路径 | 所有角色 |
| GET | `/persons/:id/duplicates` | 重复人物候选 | ADMIN/EDITOR/REVIEWER |

### 2.13.4 AI、叙事、校验

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/ai/mask-preview` | 生成脱敏预览与替换清单 | ADMIN/EDITOR |
| POST | `/ai/extract` | 启动抽取任务（需确认遮罩） | ADMIN/EDITOR |
| GET | `/ai/jobs` | 任务列表 | ADMIN/EDITOR/REVIEWER |
| GET | `/ai/jobs/:id` | 任务状态/错误/统计 | ADMIN/EDITOR/REVIEWER |
| GET | `/ai/drafts` | 草稿列表（按任务/状态） | ADMIN/EDITOR/REVIEWER |
| PATCH | `/ai/drafts/:id` | 编辑草稿字段 | ADMIN/EDITOR |
| POST | `/ai/drafts/:id/accept` | 接受并写正式事实（需确认） | ADMIN/EDITOR |
| POST | `/ai/drafts/accept-batch` | 批量接受（逐项事务） | ADMIN/EDITOR |
| POST | `/ai/drafts/:id/reject` | 拒绝草稿 | ADMIN/EDITOR |
| POST | `/narratives` | 生成叙事草稿 | ADMIN/EDITOR |
| GET | `/narratives` | 叙事列表 | ADMIN/EDITOR/REVIEWER |
| GET | `/narratives/:id` | 叙事详情与引用 | ADMIN/EDITOR/REVIEWER |
| PATCH | `/narratives/:id` | 编辑草稿内容 | ADMIN/EDITOR |
| POST | `/narratives/:id/confirm` | 人工确认 | ADMIN/EDITOR |
| GET | `/narratives/:id/export` | 导出 Markdown/HTML | ADMIN/EDITOR/REVIEWER |
| POST | `/checks/run` | 运行一致性检查 | ADMIN/EDITOR/REVIEWER |
| GET | `/checks/issues` | 问题列表/筛选 | ADMIN/EDITOR/REVIEWER |
| PATCH | `/checks/issues/:id` | 忽略（必填理由）/解决 | ADMIN/EDITOR/REVIEWER |
| GET | `/quality/report` | 质量指标与来源覆盖率 | 所有角色 |

### 2.13.5 GEDCOM、审核、审计

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/gedcom/imports` | 上传并解析，生成预览 | ADMIN/EDITOR |
| GET | `/gedcom/imports/:id` | 导入详情/警告 | ADMIN/EDITOR/REVIEWER |
| POST | `/gedcom/imports/:id/commit` | 二次确认后提交 | ADMIN/EDITOR |
| POST | `/gedcom/imports/:id/cancel` | 取消预览 | ADMIN/EDITOR |
| GET | `/gedcom/export` | 生成脱敏 GEDCOM | ADMIN/EDITOR/REVIEWER |
| GET | `/reviews` | 审核请求列表 | ADMIN/REVIEWER；发起人可看自己 |
| POST | `/reviews` | 发起合并/删除请求 | ADMIN/EDITOR |
| POST | `/reviews/:id/approve` | 批准并执行 | REVIEWER/ADMIN（自批需 confirm+reason） |
| POST | `/reviews/:id/reject` | 驳回 | REVIEWER/ADMIN |
| POST | `/reviews/:id/cancel` | 撤回（仅发起人） | 发起人 |
| GET | `/reviews/merge-preview` | 合并差异预览（不落库） | ADMIN/EDITOR/REVIEWER |
| GET | `/audit-logs` | 审计查询/筛选/分页 | ADMIN/REVIEWER |
| GET | `/health` | 健康检查（DB/版本） | 匿名 |

### 2.13.6 稳定错误码

`AUTH_REQUIRED`、`FORBIDDEN`、`VALIDATION_ERROR`、`NOT_FOUND`、`CONFLICT_VERSION`、`DUPLICATE`、`REVIEW_REQUIRED`、`INVALID_STATE`、`QUOTE_NOT_FOUND`、`FIELD_NOT_IN_QUOTE`、`MASKING_ACK_REQUIRED`、`AI_PROVIDER_ERROR`、`AI_TIMEOUT`、`EXPORT_BLOCKED`、`IMPORT_DUPLICATE`、`UNSUPPORTED_ENCODING`、`UPLOAD_TOO_LARGE`、`UNSUPPORTED_FILE_TYPE`、`RATE_LIMITED`、`INTERNAL_ERROR`。

## 2.14 前端页面与路由

| 路由 | 页面 | 可访问角色 | 关键点 |
|---|---|---|---|
| `/login` | 登录 | 匿名 | 错误提示、登录限流提示 |
| `/` | 仪表盘 | 所有 | 统计、待办、来源覆盖率、遮罩提示 |
| `/persons` | 人物列表 | 所有 | 搜索/筛选/分页/遮罩 |
| `/persons/:id` | 人物详情 | 所有 | 表单、关系、事件、引用、版本冲突、删除入口（审核） |
| `/tree` | 家谱树 | 所有 | 模式/深度/定位/详情/快捷编辑/PNG |
| `/import/ai` | AI 导入与草稿 | ADMIN/EDITOR/REVIEWER（只读） | 向导、脱敏预览、任务、草稿工作台 |
| `/checks` | 校验中心 | ADMIN/EDITOR/REVIEWER（VIEWER 仅树徽标） | 问题筛选、跳转、忽略/解决、质量指标 |
| `/kinship` | 亲缘查询 | 所有 | 消歧、路径图、引用 |
| `/narratives` | 叙事列表/工作台 | ADMIN/EDITOR/REVIEWER（VIEWER 无入口） | 事实包、逐句引用、确认/导出 |
| `/import/gedcom` | GEDCOM 导入 | ADMIN/EDITOR/REVIEWER（只读） | 预览、映射、提交 |
| `/reviews` | 审核中心 | ADMIN/REVIEWER/发起人 | 差异对比、批准/驳回、409 重预览 |
| `/audit` | 审计日志 | ADMIN/REVIEWER | 筛选、快照差异 |
| `/users` | 用户管理 | ADMIN | 新建、禁用、重置密码、角色 |

全局交互约束：

- 所有高风险动作（接受草稿、批量接受、确认叙事、合并、删除、导出、标记已故）使用明确的二次确认对话框，展示影响摘要；不使用“不再提示”。
- 表单错误显示字段级信息；API 错误统一提示并保留用户输入。
- 409 冲突弹出对比与刷新入口，不自动重试写操作。
- 任何页面不得直接渲染 AI 返回的 HTML；引用与叙事文本以纯文本加组件展示。
- VIEWER 页面明确显示“在世人物信息已按隐私规则遮罩”的说明。
- 断网/Provider 失败时，AI 页面可切换到 Mock 演示，但必须明确标识。

## 2.15 测试策略

| 层级 | 范围 | 工具 | 要求 |
|---|---|---|---|
| 单元测试 | 部分日期、年龄边界、遮罩、规则码、亲缘称谓、GEDCOM 解析/序列化、草稿校验、叙事 factRef 校验、版本/状态机 | Vitest | 每个纯函数含正常/边界/异常用例；离线 |
| API 集成 | 认证、RBAC、CRUD、409、审核、AI Mock 全流程、导出、审计不可变、GEDCOM 往返 | Vitest + Supertest + 临时 SQLite | 每个测试独立数据库文件；不依赖外网 |
| 前端组件 | 登录守卫、人物表单、草稿行、隐私展示、审核差异、引用气泡 | Vitest + Testing Library + jsdom | 覆盖关键交互与权限分支 |
| 手工 E2E | 完整演示剧本（第 4.4 节） | 浏览器 | 每个批次结束走查一次；最终验收完整走查 |
| 安全 | 越权、遮罩泄漏、路径穿越、上传类型、XSS、SQL 注入、限流 | Supertest + 静态检查 | 越权与遮罩必须自动化 |

测试数据：

- `server/tests/fixtures/`：示例 GEDCOM、示例旧谱文本、期望抽取 JSON、叙事事实包、审计快照。
- 每个集成测试使用独立临时 SQLite；全局 setup 执行 `prisma migrate deploy`；测试结束删除文件。
- AI 测试注入 `MockProvider`；OpenAI 兼容 Provider 用本地假 HTTP 服务器测试超时/错误/重试。
- 前端测试不请求真实网络，Axios mock。

## 2.16 本地启动、配置与部署

### 2.16.1 环境变量（`.env.example`）

```dotenv
PORT=4000
NODE_ENV=development
DATABASE_URL="file:../../data/genealogy.db"
JWT_SECRET="replace-with-at-least-32-random-characters"
JWT_EXPIRES_IN="8h"
COOKIE_SECURE=false
AI_PROVIDER="mock"
AI_BASE_URL="https://api.example.com/v1"
AI_API_KEY=""
AI_MODEL="deepseek-chat"
AI_TIMEOUT_MS=60000
UPLOAD_DIR="./data/uploads"
BACKUP_DIR="./data/backups"
```

- `.env` 与 `data/` 加入 `.gitignore`；`.env.example` 不含真实密钥。
- 生产环境必须设置随机 `JWT_SECRET`、`COOKIE_SECURE=true`，并通过 HTTPS 反向代理（Caddy/Nginx）暴露；Node 进程单实例。

### 2.16.2 命令（需在 Run 后、按门禁授权执行）

```bash
# 开发安装
npm install

# 初始化/迁移数据库
npx prisma migrate dev --schema server/prisma/schema.prisma

# 写入演示数据与四角色账号
npm run db:seed

# 同时启动 API(4000) 与 Vite(5173)，Vite 代理 /api
npm run dev
```

```bash
# 生产构建与启动
npm run build
npm start
```

- `prisma migrate dev` 仅用于开发；生产使用 `npx prisma migrate deploy --schema server/prisma/schema.prisma`。
- 路径含空格：脚本使用相对路径与 `cd /d "%~dp0"`；不硬编码桌面绝对路径。
- 备份：`npm run backup` 使用 SQLite `VACUUM INTO` 生成一致快照并复制 `data/uploads`；恢复步骤写入 README，恢复前必须停止服务并备份现有文件。
- 重置演示：`npm run reset:demo` 删除并重建演示数据库与上传目录（需明确确认，禁止误用于生产）。
- 后期迁云：复制项目 + `data/` + `.env`，安装 Node 24，执行 `npm ci && npm run build && npm start`；不需要安装数据库服务。

### 2.16.3 种子账号（仅演示，README 标注必须修改）

| 角色 | 用户名 | 初始密码 |
|---|---|---|
| ADMIN | `admin` | `Admin@12345` |
| EDITOR | `editor` | `Editor@12345` |
| REVIEWER | `reviewer` | `Reviewer@12345` |
| VIEWER | `viewer` | `Viewer@12345` |

生产环境不得沿用这些密码；首次部署后通过用户管理重置。

## 2.17 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| AI 幻觉/编造人物 | 污染家谱 | 草稿隔离、引文子串校验、字段在引文中校验、禁止自动接受、低置信提示 |
| 老谱繁体/竖排/模糊 | 抽取质量差 | 明确人工转写为主；抽取结果逐条核对；不做虚假 OCR 承诺 |
| 中文称谓复杂 | 查询结论错误 | 规则表 + 深度限制 + 描述式回退 + 路径与引用展示；不猜测 |
| GEDCOM 方言差异 | 导入丢失/失败 | 明确支持范围、预览警告、往返夹具、失败整体回滚 |
| 隐私泄漏 | 家族敏感信息外泄 | 呈现层统一遮罩、导出强制策略、AI 脱敏网关、越权测试 |
| 审计被篡改 | 无法追责 | 只追加 API + DB 触发器 + 限权查询 |
| SQLite 并发 | 写入锁冲突 | WAL、busy_timeout、单人编辑场景；后续可评估迁移 PostgreSQL |
| 范围膨胀 | 无法按期交付 | 固定 WBS 与批次门禁；非目标清单；追加需求必须改 Spec |
| Windows 路径空格 | 脚本失败 | 相对路径、正确引号、`cd /d "%~dp0"`、CI 本地验证 |

---

# 3. 任务拆解

## 3.0 拆解说明

- 第 1 层（`1 前端` / `2 后端` / `3 数据管理`）与第 2 层条目原文不变；第 3 层工作包由本 Spec 定义。
- 每个第 3 层工作包均给出：**前置依赖、验收标准、涉及的前端/后端/数据管理交付物**。
- 工作包粒度对应“一次授权可完成并验证”的交付；报告以工作包为单位，批次结束做一次汇总走查。
- 依赖中的 ID 指其他第 3 层工作包；未满足依赖不得开始。
- 第 5 部分只记录 WBS 层面的待确认问题，不在实现中擅自增删。

## 3.1 交付批次与依赖顺序

| 批次 | 目标 | 工作包 | 批次出口条件 |
|---|---|---|---|
| B1 地基 | 数据模型、迁移、服务与前端骨架 | 3.1.1, 3.1.2, 3.2.1, 3.6.1, 2.1.1, 1.1.1 | 迁移可重建；`/api/v1/health` 正常；前端骨架可启动；测试通过 |
| B2 身份与隐私基线 | 登录、RBAC、用户管理、账号种子、脱敏规则与呈现、仪表盘 | 2.1.2, 2.1.3, 3.1.3, 3.5.1, 3.5.2, 3.6.3, 2.7.1, 2.7.2, 1.1.2, 1.1.3 | 四角色登录成功；VIEWER 响应无完整在世信息；用户管理可用 |
| B3 档案核心 | 人物/关系/事件/来源/引用 CRUD、导出策略与前置 UI | 3.2.2, 2.2.1, 2.2.2, 2.2.3, 2.7.3, 1.2.1, 1.2.2, 1.2.3, 1.2.4 | 可完成三代人物录入、关系建立、来源引用；越权/版本冲突测试通过；导出策略可被后续 PNG/GEDCOM/叙事复用 |
| B4 家谱树 | 树 API 与可视化 | 2.3.1, 1.3.1, 1.3.2, 1.3.3 | 三种视图可用；1,000 节点首屏 < 2s；树内快捷编辑可用 |
| B5 AI 抽取闭环 | 脱敏网关、Provider、抽取校验、草稿接受、AI 导入 UI | 3.3.1, 2.4.1, 2.4.2, 2.4.3, 1.4.1, 1.4.2, 1.4.3 | Mock 全流程可演示；伪造引文被拦截；接受前正式表无变化；审计完整 |
| B6 数据质量 | 校验规则、重复候选、质量指标与校验中心 | 3.4.1, 3.4.2, 1.5.1 | 种子冲突可检出；忽略需理由；重复运行不重复报问题 |
| B7 亲缘查询 | 图算法、称谓规则、NL 意图与界面 | 2.3.2, 2.3.3, 1.5.2 | “A 和 B 是什么关系”可解释到路径与来源；歧义不自动选择 |
| B8 叙事 | 事实包、逐句引用、确认与导出 | 2.4.4, 1.6.1, 1.6.2 | 无来源事实不进入叙事；无 factRef 句子不能确认；导出含脚注 |
| B9 GEDCOM | 解析、预览、提交、导出、往返与 UI | 3.3.2, 2.5.1, 2.5.2, 2.5.3, 1.6.3, 1.6.4 | 示例族谱导入成功；重复文件被阻止；导出在世者遮罩；往返计数一致 |
| B10 协作审核 | 合并/删除审批、乐观锁、审计查询与 UI | 2.2.4, 2.6.1, 2.6.2, 2.6.3, 1.7.1, 1.7.2, 1.7.3 | 编辑发起→审核批准→执行；版本冲突 409；审计不可变 |
| B11 交付验收 | 演示家族、演示脚本、冒烟与完整验收 | 3.6.2 | 一键重置演示；四角色演示剧本全通过；`npm test`/`build` 通过；README 与验收报告完成 |

批次内部仍按工作包门禁执行；批次出口条件不替代单包验收。

## 3.2 1 前端

### 1.1 基础框架与权限

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **1.1.1** 前端工程骨架与设计规范 | Vite + React + TS 工程、AntD 中文主题、路由骨架、Axios 客户端、TanStack Query、错误边界、全局样式、开发代理 | 2.1.1 | `npm run dev:web` 可启动；`tsc --noEmit` 与 `npm run build` 通过；API 基址与 401 钩子可配置；404/错误页生效；暂无业务页面 | **前端**：`web/` 骨架、`vite.config.ts`、`src/api/client.ts`、主题与全局样式、测试配置；**后端**：仅依赖健康检查；**数据**：无 |
| **1.1.2** 登录、会话与路由守卫 | 登录页、会话恢复、角色菜单、路由守卫、退出、全局 401/403 处理 | 1.1.1, 2.1.2 | 四角色登录后菜单差异正确；刷新保持会话；未登录访问业务路由重定向登录；退出清理 Cookie；不把 JWT 存 localStorage | **前端**：`pages/Login.tsx`、`stores/auth.ts`、`router.tsx` 守卫、角色菜单；**后端**：依赖认证 API；**数据**：无 |
| **1.1.3** 仪表盘、用户管理与权限提示 | 统计卡片、待办（草稿/问题/审核）、来源覆盖率、用户管理页、遮罩说明 | 1.1.2, 2.1.3 | ADMIN 可新增/禁用用户/重置密码/改角色；非 ADMIN 无入口；仪表盘数据来自真实 API；VIEWER 显示遮罩提示 | **前端**：`pages/Dashboard.tsx`、`pages/Users.tsx`、权限/遮罩说明组件；**后端**：依赖 `/dashboard`、`/users`；**数据**：依赖角色种子 |

### 1.2 人物与关系编辑

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **1.2.1** 人物列表与高级检索 | 分页表格、关键词、世代/支系/在世筛选、排序、空态/加载/错误、重复候选入口 | 2.2.1, 2.7.2, 1.1.3 | 1,000 条数据分页可用；组合筛选正确；VIEWER 姓名与日期遮罩；点击进入详情；删除/编辑按钮按角色隐藏 | **前端**：`pages/persons/List.tsx`、筛选组件、分页；**后端**：依赖人物检索 API；**数据**：检索索引 |
| **1.2.2** 人物详情与编辑表单 | 详情页、部分日期输入、别名/世代/支系、在世状态确认、字段级引用展示与新增、版本冲突处理 | 1.2.1, 2.2.1, 2.2.3, 2.7.2 | 创建/编辑成功并刷新；部分日期可空且不伪造月日；保存携带 version，409 显示对比并保留输入；引用气泡展示来源、原文、置信度；在世→已故二次确认 | **前端**：`pages/persons/Detail.tsx`、`PersonForm`、`CitationList/CitationPopover`；**后端**：依赖人物/引用 API；**数据**：部分日期与引用结构 |
| **1.2.3** 关系编辑器与关系面板 | 父母/子女/配偶关系新增与编辑、父/母角色、亲生/收养、确定性、备注；关系列表；结构校验反馈 | 1.2.2, 2.2.2 | 可建立父母、配偶关系并即时刷新；重复/自环/性别角色错误有明确提示；关系类型与确定性可编辑；删除入口由 1.7.2 提供 | **前端**：`RelationEditor`、`RelationPanel`；**后端**：依赖关系 API；**数据**：关系约束 |
| **1.2.4** 事件与来源管理 | 事件 CRUD、图片/文本来源上传、并排转写、引用绑定、鉴权文件预览、文件重复提示 | 1.2.2, 2.2.3 | 事件可增改删并写审计；上传类型/大小受限；转写文本可保存；引用必须填写非空引文；VIEWER 无原文件入口；图片预览正常 | **前端**：`pages/sources/List.tsx`、`SourceUpload`、`TranscriptionEditor`、`EventPanel`；**后端**：依赖来源/事件/引用 API；**数据**：来源、转写、引用 |

### 1.3 家谱树可视化

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **1.3.1** 树画布、布局与导航 | 树页面、祖先/后代/全谱、深度、根节点选择、dagre 布局、缩放/平移/迷你地图、加载/空态/截断提示 | 1.2.1, 2.3.1, 2.7.2 | 三种模式可切换；改变根节点/深度后正确重绘；超过节点上限显示“继续展开”；VIEWER 节点遮罩 | **前端**：`pages/Tree.tsx`、`TreeCanvas`、布局工具、树 API hooks；**后端**：依赖树 API；**数据**：树索引 |
| **1.3.2** 节点卡片、隐私展示与详情抽屉 | 节点卡片（姓名/生卒/世代/支系/问题/来源徽标）、遮罩标识、点击抽屉、引用、跳转详情、聚焦 | 1.3.1, 1.2.2 | 卡片信息与详情一致；ERROR/WARNING 徽标可区分；点击打开抽屉并显示引用；VIEWER 无完整姓名/精确日期；聚焦动画正常 | **前端**：`TreePersonNode`、`TreeDetailDrawer`、徽标组件；**后端**：依赖树/详情 API；**数据**：问题徽标查询 |
| **1.3.3** 树内快捷编辑与大树性能 | 快捷添加父母/配偶/子女（预填）、PNG 导出确认、分支懒加载、memo/视口优化、交互走查 | 1.3.2, 2.2.2, 2.3.1, 2.7.3 | 快捷添加后树正确更新；PNG 导出经遮罩确认并写审计；1,000 节点首屏 < 2s、平移无明显卡顿；懒加载可展开被截断分支 | **前端**：快捷操作菜单、`exportPng`、性能优化；**后端**：依赖分支/关系 API；**数据**：节点上限与分片 |

### 1.4 AI 导入与确认

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **1.4.1** 导入向导与来源转写 | 三步向导第一步：选择/新建来源、上传图片或粘贴文本、图片与转写并排、保存转写、状态展示 | 1.2.4, 2.2.3 | 图片/文本来源均可创建；转写可保存并显示状态；超过大小/类型限制有提示；没有转写文本时不能进入抽取 | **前端**：`pages/import/AiWizard.tsx` 第一步、`TranscriptionWorkspace`；**后端**：依赖来源 API；**数据**：转写字段 |
| **1.4.2** 脱敏预览、任务进度与错误反馈 | 脱敏预览清单、追加屏蔽词、确认调用、任务轮询、重试、Provider/模型标识、错误详情 | 1.4.1, 2.4.1, 2.7.3 | 未勾选确认不能调用；预览列出替换项并可追加；Mock/真实 Provider 标识清晰；任务失败可重试；轮询停止无泄漏 | **前端**：脱敏预览面板、任务状态组件、错误详情；**后端**：依赖脱敏/任务 API；**数据**：AiJob 状态 |
| **1.4.3** 草稿审核工作台 | 草稿列表分组、字段编辑、原文引文对照、置信度、warnings、重复提示、关联已有、接受/拒绝/批量二次确认、结果汇总 | 2.4.3, 1.4.2 | 无效引文/字段不接受；逐条接受后显示新实体链接；批量接受列出成功/跳过原因；拒绝写审计；低置信醒目 | **前端**：`pages/import/DraftReview.tsx`、`DraftRow`、批量确认；**后端**：依赖草稿 API；**数据**：草稿状态与审计 |

### 1.5 校验与自然语言查询

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **1.5.1** 校验中心 | 运行校验、问题统计、级别/码/状态筛选、详情、跳转实体、忽略理由、解决、重复候选、质量指标 | 3.4.1, 3.4.2, 1.2.1 | 运行后问题列表更新；忽略必须填理由；跳转定位正确；重复候选可进入合并向导；质量指标来自 API；VIEWER 无入口（仅树徽标） | **前端**：`pages/Checks.tsx`、问题表格/详情、质量卡片；**后端**：依赖校验/质量 API；**数据**：问题状态与去重 |
| **1.5.2** 亲缘查询 | 查询输入、解析与消歧、路径图、称谓、引用、跳转树、示例、无路径/超限提示 | 2.3.3, 1.3.1 | 同名返回候选且不自动选择；路径每跳有标签/确定性；引用可展开；存疑路径有提示；VIEWER 遮罩 | **前端**：`pages/Kinship.tsx`、`KinshipPath`、候选选择；**后端**：依赖亲缘 API；**数据**：关系图 |

### 1.6 叙事与导出

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **1.6.1** 叙事生成与逐句引用 | 选择人物/篇幅/风格、生成、事实包预览（含排除项）、逐句引用、警告核对、编辑、保存草稿；页面仅 ADMIN/EDITOR/REVIEWER 可进入（REVIEWER 只读） | 2.4.4, 1.2.2 | 排除项明确展示；每句可查看引用；缺 factRef/未核对警告不能“全部通过”；编辑后可保存；重新生成产生新草稿；VIEWER 无入口 | **前端**：`pages/narratives/Workbench.tsx`、`NarrativeSentence`、事实包面板；**后端**：依赖叙事 API；**数据**：事实包与引用 |
| **1.6.2** 叙事确认与导出 | 叙事列表/详情、人工确认、只读态、Markdown/HTML 导出、导出遮罩摘要、脚注、审计提示、VIEWER 限制 | 1.6.1 | 未确认不能导出；确认需二次确认并显示来源数量；导出含脚注且 HTML 已转义；导出对在世者姓名/日期及引用执行遮罩并展示摘要；已确认只读；VIEWER 无叙事入口 | **前端**：`pages/narratives/List.tsx`、`Detail.tsx`、导出确认；**后端**：依赖确认/导出 API；**数据**：Narrative 状态 |
| **1.6.3** GEDCOM 导入预览与提交 | 上传、解析报告、警告/冲突、姓氏映射、无死亡默认选项、提交二次确认、结果页 | 2.5.2, 1.2.1 | 预览不写正式表；映射可调整；重复文件被阻止；提交后显示人物/家庭/事件数量；失败有明确回滚说明 | **前端**：`pages/import/GedcomWizard.tsx`、预览报告、映射表单；**后端**：依赖 GEDCOM 导入 API；**数据**：GedcomImport/Xref |
| **1.6.4** GEDCOM 导出与脱敏摘要 | 导出范围、遮罩摘要（在世人数/字段）、确认后下载、最近导出审计提示 | 2.5.3, 2.7.3 | 下载前必须确认遮罩摘要；文件含隐私 NOTE；VIEWER 无入口；导出后审计可查 | **前端**：`ExportGedcomPanel`、遮罩摘要弹窗；**后端**：依赖导出 API；**数据**：导出策略与审计 |

### 1.7 协作与审核

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **1.7.1** 审核中心与差异对比 | 待办/我发起的、差异对比（字段/关系/删除影响）、批准/驳回理由、409 重新预览 | 1.2.2, 2.6.1, 2.6.2 | 仅授权角色可审批；差异高亮且可展开全量；驳回必须填理由；版本冲突提示重新预览；执行结果与审计链接可见 | **前端**：`pages/Reviews.tsx`、`ReviewDiff`、审批弹窗；**后端**：依赖审核 API；**数据**：ReviewRequest/Audit |
| **1.7.2** 合并人物向导与删除确认 | 合并选择保留者/被合并者、字段取舍、关系/引用统计、预览、提交；删除人物/关系影响预览与提交 | 2.2.4, 2.6.1, 1.7.1 | 合并预览准确；字段取舍可逐项选择；不能自合并；删除展示级联影响；提交后进入审核而非直接执行 | **前端**：`MergeWizard`、`DeleteConfirm`、影响预览；**后端**：依赖合并预览/审核 API；**数据**：合并/删除事务 |
| **1.7.3** 审计日志与可见性说明 | 审计筛选（动作/实体/操作人/时间）、分页、快照差异、权限与遮罩说明 | 2.6.3, 2.7.2, 1.7.1 | ADMIN/REVIEWER 可查；快照差异可读；非授权无入口；说明页准确描述四角色与导出策略 | **前端**：`pages/Audit.tsx`、快照 diff、权限说明抽屉；**后端**：依赖审计 API；**数据**：审计不可变 |

## 3.3 2 后端

### 2.1 API 与权限

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **2.1.1** 服务骨架、统一响应与错误处理 | Express 应用、环境变量校验、pino 日志（敏感字段 redact）、helmet、同源/代理配置、requestId、统一响应与错误码、健康检查、优雅退出 | 3.1.1, 3.2.1 | `GET /api/v1/health` 返回 DB 状态；所有错误返回稳定错误码与 requestId；参数错误映射 400；未知路由 404；日志无密钥/Cookie；SIGINT 优雅关闭；集成测试通过 | **后端**：`server/src/app.ts`、`main.ts`、`config/env.ts`、`lib/http.ts`、`lib/errors.ts`、`lib/logger.ts`、健康路由、测试；**前端**：无（1.1.1 消费健康检查）；**数据**：依赖 schema 与连接 |
| **2.1.2** 认证、用户管理与会话 | 登录/登出/当前用户/改密、bcrypt（cost 12）、httpOnly Cookie、禁用账号、失败限流、用户 CRUD、登录审计 | 2.1.1 | 四角色可登录；Cookie 不可被 JS 读取；错误密码统一提示且限流生效；禁用账号旧 Cookie 立即失效；改密后旧会话失效；用户管理仅 ADMIN；审计记录成功/失败 | **后端**：`modules/auth`、`modules/users`、认证中间件、测试；**前端**：无（1.1.2 消费）；**数据**：User 表、登录审计 |
| **2.1.3** RBAC、参数校验、审计与安全基线 | 角色/权限映射、zod 校验中间件、审计服务与只追加触发器（增量迁移）、Origin/自定义头校验、安全响应头、登录限流验证（实现于 2.1.2）、仪表盘统计 API、越权测试 | 2.1.2 | 权限矩阵逐端点测试通过；越权返回 403；所有写接口写审计；SQLite 触发器禁止修改/删除审计；跨源写请求被拒绝；复用 2.1.2 限流并验证返回 429；`/dashboard` 返回真实统计；测试覆盖 | **后端**：`middleware/rbac.ts`、`validate.ts`、`security.ts`、`services/audit.ts`、`modules/dashboard`、触发器增量迁移、测试；**前端**：无（1.1.3 消费）；**数据**：审计表（3.1.1）/触发器（本包迁移）、权限常量 |

### 2.2 人物与关系服务

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **2.2.1** 人物 CRUD 与检索 | 创建/详情/更新、分页检索（关键词/世代/支系/在世）、部分日期、在世默认、软删除状态过滤、版本 409、隐私呈现、审计 | 2.1.3, 3.1.1, 3.2.2 | 创建/更新/查询正确；未填死亡默认 LIVING；月日为空不伪造；`version` 不匹配返回 409；MERGED/DELETED 不出现在列表；关键词/组合筛选正确；人物变更写审计；VIEWER 呈现调用统一遮罩 | **后端**：`modules/persons`、zod Schema、服务与测试；**前端**：无（1.2.1/1.2.2 消费）；**数据**：人物索引、部分日期字段 |
| **2.2.2** 关系 CRUD 与图约束 | 亲子/配偶关系创建与更新、父母角色、亲生/收养、确定性、配偶规范化、唯一性、自环/亲子环/性别角色校验、版本控制 | 2.2.1, 3.2.2 | 可建立父母与配偶关系；重复配偶被拒绝；自环/亲子环被拒绝；父母角色与性别冲突被拒绝；配偶 A/B 顺序规范化；更新需 version；所有变更审计；删除不提供直接接口（进入 2.2.4/2.6 审核） | **后端**：`modules/relations`、图约束服务、测试；**前端**：无（1.2.3 消费）；**数据**：关系索引、约束规则 |
| **2.2.3** 事件、来源与引用 | 事件 CRUD；来源 multipart 上传（MIME/魔数/大小/哈希/随机文件名）；转写文本；鉴权流式下载；Citation 创建/删除；引用字段路径校验；审计 | 2.2.1 | 事件可增改删且至少关联人物或关系；上传类型/大小受限；文件路径不可穿越；同文件提示重复；转写可保存；Citation 引文非空且目标存在；VIEWER 无法取原文件；审计完整 | **后端**：`modules/events`、`modules/sources`、`services/files.ts`、测试；**前端**：无（1.2.4 消费）；**数据**：Source/Citation、上传目录规范 |
| **2.2.4** 合并/删除事务核心 | 合并差异预览、字段取舍、关系/引用重指向与去重、源人物 MERGED；删除影响预览、软删除人物/物理删除关系与引用；版本校验、事务回滚、审计 | 2.2.2, 2.2.3, 2.1.3 | 合并预览准确统计字段冲突/关系/引用；合并后关系无重复、引用无丢失、源人物标记 MERGED；删除预览列出级联影响；任一失败整体回滚；自合并/跨家族/已删除人物被拒绝；执行逻辑只供审核服务调用，不暴露绕过审核的执行 API | **后端**：`services/merge.ts`、`services/delete.ts`、`modules/reviews/merge-preview`、测试；**前端**：无（1.7.2 消费）；**数据**：合并/删除状态与审计快照 |

### 2.3 树与亲缘计算

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **2.3.1** 树数据组装与分片 | 祖先/后代/全谱查询、深度与节点上限、配偶附带展示、截断标记、分支懒加载、隐私呈现 | 2.2.2, 2.7.2, 3.2.2 | 三种模式节点/边正确；depth 与上限生效；超限返回 truncated 与 childCount；分支接口可继续加载；1,000 节点响应 < 2s（种子基准）；VIEWER 全部遮罩；无悬空边 | **后端**：`modules/tree`、树查询服务、测试；**前端**：无（1.3.x 消费）；**数据**：树查询索引 |
| **2.3.2** 亲缘图与路径算法 | 有效关系图、BFS 最短路径、确定性权重、同分多路径、每跳标签与引用、无路径/超限处理 | 2.2.2 | 父母/子女/配偶/半同胞/祖孙等路径正确；存疑边降低置信并提示；返回最多 3 条备选；深度上限 8；无路径不猜测；路径结果附引用；算法为只读且可单测 | **后端**：`services/kinship/graph.ts`、路径解释、测试；**前端**：无（1.5.2 消费）；**数据**：关系图与确定性字段 |
| **2.3.3** 中文称谓与自然语言查询 | 称谓规则表、描述式回退、长幼判断、姓名消歧、LLM 意图解析（Mock 正则）、服务端答案模板 | 2.3.2, 2.4.1 | 常见三代内称谓正确；长幼未知不臆测；超出规则返回描述路径；同名返回候选且不自动选择；Mock 可解析示例问句；答案模板含路径与引用；存疑路径提示 | **后端**：`services/kinship/terms.ts`、`modules/kinship`、意图解析与测试；**前端**：无（1.5.2 消费）；**数据**：称谓规则常量、引用 |

### 2.4 AI 服务

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **2.4.1** Provider 抽象、OpenAI 兼容、Mock 与任务治理 | Provider 接口、OpenAI 兼容 HTTP 客户端、Mock、任务状态机、超时/重试、Prompt 版本、输入哈希、脱敏输入保存、替换映射还原、审计 | 2.7.1, 2.7.3, 2.1.3 | 无 Key 时回落 Mock 并提示；真实 Provider 可配置 baseURL/model；超时/网络错误进入 FAILED 且可重试；任务记录 provider/model/promptVersion/inputHash；出站只发送脱敏文本；返回后正确还原占位符；日志无明文敏感数据；假服务器测试通过 | **后端**：`services/ai/provider.ts`、`openaiCompat.ts`、`mock.ts`、`services/ai/jobs.ts`、Prompt 目录、测试；**前端**：无（1.4.2 消费）；**数据**：AiJob 字段与保留策略 |
| **2.4.2** 抽取 Prompt、Schema 与引用校验 | 抽取提示词、严格 JSON 输出、zod 结构校验、sourceQuote 子串校验、字段在引文中校验、confidence 归一、伪引用/未知枚举拦截、Prompt 注入防护 | 2.4.1, 3.3.1 | 伪造引文标记 QUOTE_NOT_FOUND 且禁止接受；字段不在引文标记 FIELD_NOT_IN_QUOTE；未知枚举/多余字段被拒绝或裁剪；confidence 越界被截断、缺失无效；注入文本不会改变系统指令；单测覆盖正常/空输出/畸形 JSON | **后端**：`prompts/extract.ts`、`services/ai/extractValidator.ts`、测试；**前端**：无（1.4.3 消费）；**数据**：草稿结构、校验标记 |
| **2.4.3** 草稿状态机与接受事务 | 草稿查询/编辑/拒绝、接受（新建或关联已有）、tempId 解析、人员→关系→事件顺序、逐项事务、审计、批量汇总、幂等 | 2.4.2, 2.2.1, 2.2.2, 2.2.3, 3.3.1 | 抽取后正式表人数不变；接受一条才新增一条；无效引文不可接受；关系依赖已拒绝人员时跳过并说明；批量接受逐项成功/跳过汇总；重复接受被拒绝；每次接受写审计；关联已有只补引用不覆盖字段 | **后端**：`modules/ai/drafts`、`services/ai/accept.ts`、测试；**前端**：无（1.4.3 消费）；**数据**：AiDraft 状态、引用与审计 |
| **2.4.4** 叙事生成与逐句引用 | 事实包构建（仅有来源）、排除项说明、叙事 Prompt、factRefs 校验、引用服务端附加、辅助警告、确认状态、Markdown/HTML 导出与脚注、导出遮罩、审计 | 2.4.1, 2.4.2, 2.2.3 | 无引用事实不进入事实包且返回排除原因；无效 factRef 句子不能确认；引用全部由服务端解析；确认需显式调用并写审计；已确认只读；导出仅 CONFIRMED 且含脚注；导出对在世者相关文本/引用按策略遮罩；HTML 转义；VIEWER 无叙事访问权限 | **后端**：`services/ai/factPackage.ts`、`narrativeValidator.ts`、`modules/narratives`、导出器、测试；**前端**：无（1.6.x 消费）；**数据**：Narrative 内容、引用、状态 |

### 2.5 导入导出服务

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **2.5.1** GEDCOM 5.5.1 解析器 | 行解析、xref、INDI/FAM、BIRT/DEAT/MARR/DIV、NAME/SEX/OCCU/NOTE、CONT/CONC、UTF-8/BOM、日期近似、编码/标签警告、行号引用 | 3.3.2, 2.2.1, 2.2.2 | 示例 GEDCOM 解析计数正确；姓名斜杠拆分正确；CONT/CONC 正确；非 UTF-8 明确报错；未知标签列为警告；不支持日期保留原文；解析不写数据库；测试覆盖畸形文件/缺失 xref | **后端**：`lib/gedcom/parser.ts`、测试夹具；**前端**：无（1.6.3 消费）；**数据**：GEDCOM 映射常量、夹具 |
| **2.5.2** 导入预览、映射与幂等提交 | 预览持久化、统计/警告、重复姓名候选、同文件哈希阻止、映射选项、事务提交、Source/Citation/Xref、取消、审计 | 2.5.1, 2.2.3 | 预览阶段正式表无变化；同文件已提交被阻止；映射可调整；提交后人物/家庭/关系/事件计数与预览一致；失败整体回滚；每个导入实体有来源行引用；写审计；取消后状态为 `CANCELLED` 且不留下半成品 | **后端**：`modules/gedcom/imports.ts`、提交事务、测试；**前端**：无（1.6.3 消费）；**数据**：GedcomImport/Xref、Source/Citation |
| **2.5.3** GEDCOM 序列化、脱敏导出与往返 | 5.5.1 序列化、FAM 生成算法、xref、隐私 NOTE、导出前自检、往返夹具、审计、下载阻断 | 2.5.1, 2.7.3, 2.2.2 | 导出文件可被本解析器重新解析；人物/家庭/关系计数一致；在世者姓名/日期/地点/NOTE 已遮罩；页首 NOTE 存在；自检失败不下载；导出写审计；在世人名不出现在 .ged 文件 | **后端**：`lib/gedcom/serializer.ts`、导出服务、往返测试；**前端**：无（1.6.4 消费）；**数据**：xref 映射、导出策略 |

### 2.6 协作与审核服务

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **2.6.1** 审核请求状态机与并发控制 | 提交/批准/驳回/撤回、动作类型、预期版本快照、状态机、自批规则、403/409、审计 | 2.1.3, 2.2.1 | 仅 EDITOR/ADMIN 可提交；仅 REVIEWER/ADMIN 可审批；ADMIN 自批必须 confirm+理由；PENDING 才能审批；版本变化返回 409；非法状态转换被拒绝；每次操作写审计；单测覆盖状态机 | **后端**：`modules/reviews`、状态机、版本校验、测试；**前端**：无（1.7.1 消费）；**数据**：ReviewRequest、审计 |
| **2.6.2** 合并/删除审批执行 | 审批通过后调用 2.2.4 事务；动作校验、版本复核、执行失败处理、审计、结果返回 | 2.6.1, 2.2.4 | 批准与执行在同一事务；版本变化返回 409 且请求仍 PENDING；执行失败回滚并记录错误；成功后请求 APPROVED 并返回结果；不可绕过审核直接执行；合并/删除各写审计快照 | **后端**：审批执行器、测试；**前端**：无（1.7.1/1.7.2 消费）；**数据**：审核/合并/删除审计 |
| **2.6.3** 审计查询与差异快照 | 审计筛选分页、实体快照、字段差异、访问控制、不可变验证、导出（可选 JSON） | 2.6.1 | 仅 ADMIN/REVIEWER 可查；按动作/实体/操作人/时间筛选；快照可读且差异正确；无修改/删除接口；触发器阻止更新/删除；分页稳定；测试覆盖 | **后端**：`modules/audit`、diff 工具、测试；**前端**：无（1.7.3 消费）；**数据**：审计索引、触发器 |

### 2.7 隐私脱敏服务

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **2.7.1** 脱敏规则引擎 | 姓名、日期、地点、文本联系方式、文件访问的遮罩函数；空值与单字/复姓处理；确定性；集中常量 | 3.5.1, 3.5.2 | 姓名保留首字并遮罩其余；单字/空值不崩溃；在世日期仅年份；地点截断；电话/身份证/邮箱/详细住址被替换；同输入同输出；单测覆盖边界 | **后端**：`services/privacy/mask.ts`、测试；**前端**：无（1.3.2 等消费遮罩展示，不新增组件）；**数据**：脱敏矩阵常量 |
| **2.7.2** 角色可见性与响应过滤 | Person/Relation/Event/Source/Citation 呈现器；对引文等文本中的在世姓名二次脱敏；按角色裁剪；VIEWER 隐藏在世详情/原文件/引文；VIEWER 无叙事权限 | 2.7.1, 2.1.3 | VIEWER 响应不含完整在世姓名、精确日期、电话、文件路径；EDITOR/REVIEWER/ADMIN 可见全量；已故者完整但引文中的在世姓名仍按 VIEWER 策略遮罩；来源文件仅授权角色；响应快照测试覆盖所有实体；任何路由不得直接返回 Prisma 实体 | **后端**：`services/privacy/presenters.ts`、测试；**前端**：无（全站消费）；**数据**：敏感级别映射 |
| **2.7.3** 导出策略与第三方调用脱敏 | 导出统一策略与遮罩摘要；AI 出站占位符替换（已知在世姓名/别名、联系方式、精确日期）、预览、追加屏蔽词、还原、映射保留 7 天、审计 | 2.7.1, 2.2.3, 3.5.2 | 导出无关闭遮罩选项；导出前返回遮罩摘要并需确认；AI 出站文本不含在世者完整姓名/联系方式；预览列出替换项；可追加屏蔽词；还原正确；映射仅 ADMIN 可查并在 7 天后清空；普通日志不含敏感值；测试用断言扫描请求体 | **后端**：`services/privacy/exportPolicy.ts`、`aiOutbound.ts`、测试；**前端**：无（1.4.2/1.6.4 消费）；**数据**：导出/脱敏审计、保留策略 |

## 3.4 3 数据管理

### 3.1 数据模型

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **3.1.1** Prisma 模型、枚举值与关系 | 15 个模型、字符串枚举常量、关系、唯一/索引、软删除/版本字段、JSON TEXT 字段、初始 schema 与初始迁移（唯一归属本包） | 无 | `prisma validate` 与首次迁移成功；15 个模型字段/关系完整；SQLite 不支持的原生枚举/数组未被使用；`version`/`status`/审计字段齐全；重复运行迁移无副作用；schema 评审通过 | **数据**：`server/prisma/schema.prisma`、初始迁移、枚举常量；**后端**：Prisma Client 类型；**前端**：共享类型（后续） |
| **3.1.2** 部分日期、不确定值、软删除与版本规范 | PartialDate 类型、日期比较/年龄边界、精度与约值、人物状态生命周期、软删除与合并语义、版本递增规范 | 3.1.1 | 部分日期可空且不伪造；比较函数返回区间/不确定；约值降级规则可测；状态转换非法时拒绝；软删除/合并查询默认过滤；版本只在成功写入时 +1；测试覆盖闰年/缺月/缺日/约值 | **数据**：日期与状态规范、测试；**后端**：`shared/utils/date.ts`、测试；**前端**：表单类型提示 |
| **3.1.3** ER 图、数据字典与模型评审记录 | Mermaid ER 图、字段字典（类型/必填/敏感级别/约束）、状态机、索引清单、与 schema 的一致性检查 | 3.1.1, 3.1.2 | 文档覆盖全部模型与字段；ER 与 schema 一致；敏感级别标注完整；状态机与审核/叙事/草稿一致；评审问题有结论；可作为答辩材料 | **数据**：`docs/er.md`、`docs/data-dictionary.md`；**后端**：无；**前端**：无 |

### 3.2 存储与索引

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **3.2.1** SQLite 初始化、连接参数与迁移 | 数据库路径、WAL、foreign_keys、busy_timeout、连接单例、开发/测试/生产配置、迁移/重置脚本 | 3.1.1 | 启动后 PRAGMA 生效；外键约束有效；并发读写入不立即锁死；测试使用独立临时库；`migrate deploy` 可在空库执行；重置脚本需明确确认 | **数据**：数据库初始化、迁移脚本、`.env.example`；**后端**：`lib/prisma.ts`、启动检查；**前端**：无 |
| **3.2.2** 索引、文件存储与备份恢复 | 查询索引、上传目录与命名/哈希、10MB 限制、备份（VACUUM INTO + uploads）、恢复说明、备份测试 | 3.2.1, 3.1.1 | 人物/关系/事件/问题/草稿/审计索引生效；上传文件名随机且不可路径穿越；备份包含 DB 与上传；恢复后计数一致；备份文件不含明文密钥；测试可自动执行 | **数据**：索引迁移、`data/uploads` 规范、备份脚本；**后端**：文件存储工具；**前端**：无 |

### 3.3 导入与映射

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **3.3.1** 来源、转写、草稿与引用数据结构 | Source 类型/状态、转写状态、AiJob/AiDraft payload、tempId、Narrative 内容结构、Citation 字段路径规范、zod Schema | 3.1.1, 3.1.2 | 各 JSON 结构有 zod Schema 与类型；tempId 关系可解析；引用字段路径白名单；非法 JSON 被拒绝；示例夹具通过校验；文档说明状态机 | **数据**：结构与 Schema、夹具、文档；**后端**：共享 Schema；**前端**：类型定义 |
| **3.3.2** GEDCOM 映射表、幂等键与夹具 | 标签映射、日期/姓名规则、FAM/INDI 转换、xref、文件哈希幂等、样例 GEDCOM 与期望输出、不支持项清单 | 3.3.1, 3.1.1 | 映射表覆盖支持标签；xref 唯一；同文件哈希可阻止重复；样例夹具可解析；不支持标签明确列出；测试覆盖姓名拆分/日期近似/缺失 xref | **数据**：映射常量、夹具、文档；**后端**：类型与常量；**前端**：无 |

### 3.4 数据质量

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **3.4.1** 校验规则码表与执行器 | 18 条规则、严重级、阈值、去重键、运行器、问题状态、自动复检解决、忽略理由、API | 2.2.2, 3.1.1 | 所有规则码有实现与测试；种子冲突可检出；重复运行不产生重复问题；未再出现自动 RESOLVED；IGNORE 保留且需理由；规则只读不改变档案；接口权限正确 | **数据**：`shared/constants/checks.ts`、规则文档；**后端**：`services/checks`、`modules/checks`、测试；**前端**：无（1.5.1 消费） |
| **3.4.2** 重复人物候选与质量指标 | 同名/出生年/共同父母规则、姓名相似度、候选排序、质量指标（来源覆盖率/问题统计）、接口 | 3.4.1, 2.2.1 | 构造重复样本可被召回；不相似人物不误报为高置信；候选附理由且不自动合并；质量指标计算正确；`/persons/:id/duplicates` 与 `/quality/report` 权限正确；测试通过 | **数据**：相似度规则与指标定义；**后端**：去重服务/质量服务、测试；**前端**：无（1.5.1 消费） |

### 3.5 隐私数据规则

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **3.5.1** 在世判定与敏感级别 | 默认 LIVING/UNKNOWN 遮罩、死亡事实确认、L0–L3 分类、字段敏感级别、状态变更审计规则 | 3.1.1 | 新建无死亡默认 LIVING；UNKNOWN 按遮罩；死亡事实触发确认流程；L0–L3 字段无遗漏；状态变更审计；测试覆盖导入/手工/合并场景 | **数据**：`shared/constants/sensitivity.ts`、规则文档；**后端**：判定函数、测试；**前端**：状态确认提示 |
| **3.5.2** 字段脱敏矩阵、导出规则与审计留存 | 角色×字段矩阵、导出遮罩矩阵、AI 出站规则、审计保留策略（默认永久、不可删）、文档与常量 | 3.5.1, 2.1.3 | 矩阵覆盖人物/关系/事件/引文/叙事/文件；无未定义字段；导出规则与实现一致；审计无删除入口；保留策略写入文档；矩阵驱动测试无遗漏 | **数据**：矩阵常量、`docs/privacy.md`；**后端**：策略常量与测试；**前端**：遮罩说明组件数据源 |

### 3.6 迁移与种子数据

| 工作包 | 范围 | 前置依赖 | 验收标准 | 交付物 |
|---|---|---|---|---|
| **3.6.1** 迁移规范与运行手册 | 基于 3.1.1 的初始迁移验证、迁移流程文档、开发/生产命令、回滚与备份演练、迁移自检脚本；审计触发器迁移归属 2.1.3，本包只登记 | 3.1.1, 3.1.2, 3.2.1 | 空库 `migrate deploy` 成功；备份/回滚演练可执行；迁移文档可照做；迁移前备份要求明确；无破坏性隐式清库；测试数据库可自动重建；增量迁移清单与归属清晰 | **数据**：`docs/migrations.md`、迁移自检脚本；**后端**：迁移命令封装；**前端**：无 |
| **3.6.2** 演示家族、质量场景与性能基准 | 四代张氏演示家族（25–30 人）、两处来源、引用、在世/已故样本、故意年龄冲突、疑似重复、待抽取文本、可重复种子；1,000 / 10,000 人物合成数据基准脚本 | 3.6.1, 3.6.3, 2.2.1, 2.2.2, 2.2.3, 3.4.1, 2.3.1 | 种子幂等可重置；四代结构完整；含 ERROR/WARNING/INFO 场景；在世者遮罩可见；引用覆盖率可展示；抽取示例可匹配 Mock；重置脚本有确认；基准脚本输出分页 P95 与 1,000 节点树首屏耗时，可复现 AC-20 | **数据**：`server/prisma/seed.ts`、示例文本、`scripts/benchmark.ts`；**后端**：种子/基准脚本；**前端**：演示说明 |
| **3.6.3** 四角色账号、演示文本与重置脚本 | 四个角色账号（bcrypt）、演示文本夹具、重置演示脚本、README 账号说明（强制修改提示） | 3.6.1, 2.1.2 | 四个账号均可登录且角色正确；密码为 bcrypt 哈希；重复执行不重复建号；重置脚本需明确确认；README 标注仅演示用；测试验证登录 | **数据**：账号种子、演示文本；**后端**：seed/reset 脚本；**前端**：登录页提示 |

**第 3 层工作包统计**：前端 22 个、后端 23 个、数据管理 14 个，合计 59 个。第 1/2 层条目与负责人给定 WBS 完全一致。

---

# 4. 验收标准

## 4.1 功能验收

| 编号 | 验收项 | 可复现的通过条件 |
|---|---|---|
| **AC-01** | 本地环境与启动 | 在干净目录执行 `npm install`、`npx prisma migrate dev`、`npm run db:seed`、`npm run dev` 后，API `/api/v1/health` 返回正常、前端可登录；全程不需要 Docker、MySQL、Java、Maven；`npm run build` 与 `npm start` 可启动生产模式 |
| **AC-02** | 登录、会话与 RBAC | 四个种子账号可登录；Cookie 为 httpOnly 且 JS 读不到；错误密码连续尝试触发 429；DISABLED 账号立即无法访问；四角色菜单与接口权限符合 2.6.3 矩阵；越权请求返回 403 |
| **AC-03** | 人物 CRUD 与部分日期 | 可创建含年/月/日缺省、原文、约值、农历标记的人物；未填死亡默认 LIVING；保存后 `version` 递增；用旧 version 更新返回 409；MERGED/DELETED 默认不出现在列表；VIEWER 看到的姓名/日期已遮罩 |
| **AC-04** | 关系与图约束 | 可建立父母/子女、配偶关系；重复配偶、自环、亲子环、父母性别角色冲突、跨家族端点均被拒绝；配偶 A/B 规范化；更新需 version；关系变更写审计 |
| **AC-05** | 来源、转写与引用 | 可上传图片与文本来源（≤10MB、白名单、魔数校验）；转写可保存；文件仅授权角色可经鉴权流获取；Citation 引文非空且绑定到有效字段；删除引用写审计；VIEWER 无法获取原文件 |
| **AC-06** | 家谱树 | 四代种子数据可在祖先/后代/全谱三种模式显示；根节点、深度、支系筛选生效；节点上限与“继续展开”生效；VIEWER 节点遮罩；树内快捷添加关系后图更新；PNG 导出前有遮罩确认并写审计 |
| **AC-07** | AI 抽取隔离与引文校验 | 对 Mock 示例文本执行抽取后，正式 `Person` 数量不变；草稿逐条带 sourceQuote 与 confidence；把引文改成原文不存在的句子后，接受接口返回 `QUOTE_NOT_FOUND`；字段值不在引文中返回 `FIELD_NOT_IN_QUOTE`；不存在自动接受接口 |
| **AC-08** | 草稿接受事务 | 接受人员草稿后生成人物 + 引用 + 审计；关系草稿通过 tempId 正确关联；被拒绝人员导致的关系草稿会被跳过并返回原因；批量接受逐项汇总；重复接受被拒绝；关联已有人员只补引用、不覆盖字段 |
| **AC-09** | 一致性校验 | 种子数据运行校验可检出至少 1 个 ERROR、1 个 WARNING、1 个 INFO；忽略问题必须填写理由；重复运行不产生重复问题；复检未再出现的问题自动标记 RESOLVED；校验不改变档案数据 |
| **AC-10** | 重复候选与质量指标 | 种子中重复人物可被列为候选并附理由；候选不会自动合并；`/quality/report` 返回来源覆盖率与问题统计；普通用户无法看到越权细节 |
| **AC-11** | 亲缘查询 | 输入“张德明和李秀英是什么关系”返回中文称谓、逐跳路径、确定性与来源引用；同名人物返回候选且不自动选择；无连通路径时明确提示；含存疑边的结论有免责提示；VIEWER 输出遮罩 |
| **AC-12** | 叙事可追溯 | 生成叙事时，无引用事实出现在“未纳入”清单而非正文；每句至少一个有效 factRef；删除引用或伪造 factRef 后句子不能确认；确认后写审计且只读；Markdown/HTML 导出含脚注且 HTML 已转义 |
| **AC-13** | GEDCOM 导入 | 示例 `.ged` 预览显示正确计数且不写正式表；非 UTF-8 文件明确报错；同文件重复导入被阻止；修改映射后提交成功；失败整体回滚；每个导入实体有来源行引用；写审计 |
| **AC-14** | GEDCOM 导出与往返 | 导出文件可被本系统重新解析；人物/家庭/关系计数与导出前一致；在世者姓名、精确日期、地点、NOTE 已遮罩；页首隐私 NOTE 存在；自检失败时不提供下载；写审计 |
| **AC-15** | 合并审批 | EDITOR 发起合并请求，REVIEWER 看到字段/关系/引用差异；批准后关系重指向且去重、源人物 MERGED、引用保留、写审计；EDITOR 不能审批；自合并被拒绝；版本变化返回 409 |
| **AC-16** | 删除审批 | 删除人物/关系必须提交审核；预览列明级联影响；批准后人物软删除、关系按确认物理删除、审计保留快照；未审批不能执行；版本冲突返回 409 |
| **AC-17** | 审计不可变 | 审计可按动作/实体/操作人/时间筛选；ADMIN/REVIEWER 可查，其他角色 403；不存在修改/删除审计的 API；直接 UPDATE/DELETE 被 SQLite 触发器拒绝；关键动作均有记录 |
| **AC-18** | 隐私与脱敏 | VIEWER 响应不含在世者完整姓名、精确日期、电话、身份证、详细地址、文件路径；导出 GEDCOM/叙事均遮罩在世者；界面无关闭遮罩开关；AI 出站预览展示替换项，确认前不发请求；普通日志无敏感值 |
| **AC-19** | 安全基线 | 恶意文件名无法路径穿越；非法 MIME/魔数被拒绝；跨源写请求被拒绝；登录限流生效；XSS 文本按纯文本渲染；SQL 注入尝试无效；上传文件不能匿名访问；密码哈希 cost ≥ 12 |
| **AC-20** | 性能与生产模式 | 10,000 人物下分页查询 P95 < 300ms；1,000 节点树首屏 < 2s（本机基准，由 `scripts/benchmark.ts` 复现）；生产构建后单进程可访问 SPA 路由与 API；备份恢复后数据计数一致；`npm test`、`npm run lint`、`npm run build` 全通过 |

## 4.2 五项原则验收

| 原则 | 自动化证据 | 人工证据 |
|---|---|---|
| **P1** AI 只生成建议 | 抽取后人数不变的集成测试；接受草稿才新增；AI 模块无可写正式表的路径 | 演示中抽取完成但人物列表不变；人工点击接受后才出现 |
| **P2** 引文与置信度可验证 | 伪造引文/字段不在引文/缺失置信度测试；接受接口拒绝无效草稿 | 草稿工作台展示原文、置信度颜色与警告；无效接受按钮禁用 |
| **P3** 隐私默认安全 | 四角色响应快照；导出文件扫描；AI 出站请求体断言 | 上传→脱敏预览→确认→调用；VIEWER 页面遮罩；导出摘要 |
| **P4** 叙事逐句可追溯 | factRef 有效性测试；无来源事实排除测试；确认/导出状态测试 | 逐句引用悬浮；确认对话框列出来源数量；导出脚注 |
| **P5** 高风险人工确认+审计 | 审核状态机/自批/409 测试；审计触发器测试；合并/删除事务测试 | 编辑发起→审核批准；审计中心可见 before/after |

## 4.3 质量门禁

- 每个工作包：实现、迁移（如涉及）、可直接运行的测试、验证步骤齐全；对 Spec 验收标准逐条自查并报告“通过/未通过”。
- 每个批次出口：相关包全部通过；批次演示脚本可走通；无已知阻断缺陷。
- 最终门禁：AC-01 至 AC-20 全部通过；P1–P5 均有证据；`npm test`、`npm run lint`、`npm run build`、`npm start` 通过；README、演示脚本、备份/恢复说明、验收报告完成。
- 任何未通过项必须保持未完成状态，不得以“后续优化”视为通过；如需调整验收标准，必须先修改本 Spec 并由负责人确认。

## 4.4 端到端演示剧本（答辩/验收）

前置：`npm run db:seed` 已写入张氏四代演示数据；浏览器清空 Cookie。

| 步骤 | 角色 | 操作 | 预期 |
|---|---|---|---|
| 1 | ADMIN | 登录，查看仪表盘 | 显示人物数、问题数、待审草稿、待审审核、来源覆盖率；无报错 |
| 2 | EDITOR | 进入 AI 导入，上传示例老谱文本/图片，保存转写 | 转写保存成功；图片与文本并排可对照 |
| 3 | EDITOR | 点击 AI 抽取，查看脱敏预览并确认 | 预览展示占位符与替换清单；确认后 Mock 任务开始并完成；界面标识“Mock（无外部调用）” |
| 4 | EDITOR | 打开草稿工作台 | 每条草稿显示字段、原文引文、置信度；低置信醒目；尝试接受无效引文被拒绝 |
| 5 | EDITOR | 逐条接受 3 个人物与 2 个关系，拒绝 1 条 | 接受项生成正式人物/关系与引用，显示实体链接；被拒绝项不写正式表；审计可查 |
| 6 | EDITOR | 打开家谱树，切换祖先/后代/全谱，定位张德明 | 四代结构、关系线、配偶线正确；节点详情与引用可看 |
| 7 | EDITOR | 运行一致性校验，打开问题详情，忽略一条 WARNING 并填理由 | 检出年龄冲突/疑似重复/来源缺失；忽略需理由；重复运行不重复报问题 |
| 8 | EDITOR | 进入亲缘查询，输入“张德明和李秀英是什么关系” | 返回称谓、路径、确定性、来源；同名时先让用户选择；无路径不猜测 |
| 9 | EDITOR | 为张德明生成叙事，查看事实包排除项并逐句核对，确认后导出 Markdown | 无来源事实不进入正文；每句有引用；确认后才能导出；导出含脚注 |
| 10 | EDITOR | 发起重复人物合并请求 | 预览展示字段差异、关系/引用统计；提交后进入审核中心，不直接执行 |
| 11 | REVIEWER | 审核并批准合并 | 关系重指向且去重、源人物标记合并、引用保留；审计出现合并前后快照；树数据更新 |
| 12 | ADMIN | 导出 GEDCOM，查看遮罩摘要并确认 | 在世者姓名/日期/地点遮罩；文件含隐私 NOTE；导出审计可查；再次解析计数正确 |
| 13 | VIEWER | 登录查看人物、树、亲缘 | 在世者遮罩；无叙事入口；无法访问来源原文件与导出入口；已故者信息完整受限可见 |
| 14 | ADMIN | 打开审计中心，筛选合并/删除/AI 接受 | 关键动作均有记录、快照可读；无修改/删除入口 |

## 4.5 验收判定

- 单包：验收标准全部满足且测试通过才报告“通过”；任何一条失败即“未通过”，列出原因与修复计划，不进入下一包。
- 批次：批次出口条件全部满足才进入下一批；批次总结会对照本 Spec 逐条核对。
- 最终：AC-01–AC-20 与 P1–P5 全部有证据，且用户完成演示走查并确认，才算交付完成。
- 验收报告需包含：工作包、对应验收标准、测试命令与结果、已知限制、下一步。

---

# 5. 待人工确认问题（WBS 层面）

以下问题只记录，不修改负责人给定的第 1/2 层 WBS。若你认为需要调整 WBS 结构，请直接指出；未指出时按“默认处理”执行。

| 编号 | 问题 | 默认处理 | 影响 |
|---|---|---|---|
| Q1 | 负责人给定的 WBS 没有独立的“测试/部署/系统设置”第 2 层条目 | 测试与启动验证写入每个工作包；部署与备份写入 2.1/3.2；不新增第 2 层条目 | 测试与运维不会单独成包，但每包 DoD 必须包含；答辩时可在 Spec 中追溯 |
| Q2 | 老谱图片是否需要自动 OCR/手写识别 | 不做自动识别；图片仅作来源与人工转写底稿，AI 从转写文本抽取 | 若要求“拍照即出结构化结果”，需追加视觉模型/OCR 的独立工作包与新依赖 |
| Q3 | GEDCOM 来源结构是否要完整高保真 | 只做 INDI/FAM 核心标签 + 行级来源引用；不支持完整 SOUR/REPO/OBJE | 导入导出会丢失部分来源细节；若对接专业谱牒软件需另行评估 |
| Q4 | 农历/朝代年号是否需要自动换算公历 | 只保存原文 + 人工填写的公历近似值，不做换算表 | 老谱日期校验只能基于可推导的年份；不会伪造精确日期 |
| Q5 | 导出是否必须对在世者强制遮罩（即使目标软件需要完整数据） | 强制遮罩，无关闭开关；页首写明遮罩说明 | 导出的 GEDCOM 在第三方软件中在世人物信息不完整，这是隐私原则的必然结果 |
| Q6 | VIEWER 的可见范围与来源原图权限 | VIEWER 看在世者遮罩信息、已故者完整但受限；不可访问来源原文件与导出；EDITOR/REVIEWER/ADMIN 可看全量 | 若家族希望普通成员看到原图，需要新增“来源公开级别”并改变隐私矩阵 |
| Q7 | 是否需要在 MVP 内支持多家族切换 | 不提供 UI；数据模型保留 `familyId`，默认单家族 | 后期扩展多家族时需要补切换、隔离与权限；当前实现不做伪多租户 |
| Q8 | GEDCOM 提交是否允许跳过个别冲突人物（部分导入） | 全量事务提交，不允许部分导入；冲突在预览中处理或取消 | 若需要部分导入，需要新增“逐条跳过”UI、事务策略与审计设计 |

---

## 6. 变更记录

| 版本 | 日期 | 变更 | 状态 |
|---|---|---|---|
| v1.0 | 2026-10-21 | 初版：四项固定部分、59 个工作包、11 个交付批次、8 个待确认问题 | 待审核 |

**下一步**：请审核本 Spec。若同意，请回复 **Run**；我将从 B1 的 `3.1.1 Prisma 模型、枚举值与关系` 开始，先提交该工作包的实现方案与文件清单，等待你再次授权后才写代码。若需修改，请按章节或工作包编号指出，我会先更新本 Spec，再等待审核。
