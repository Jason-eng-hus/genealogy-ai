# 数据库迁移规范与运行手册（3.6.1）

> 适用版本：Spec v1.0（校订 R2）。本文是 `server/prisma/schema.prisma`、`server/prisma/migrations/` 与 SQLite 数据库的迁移规范，覆盖开发、测试、生产环境的创建、部署、备份、回滚与演练流程。

## 1 基本原则

- **迁移只向前（forward-only）**：SQLite 不提供可靠的自动降级；任何“回滚”都通过恢复迁移前备份完成，不维护 `down.sql`。
- **账本为准**：`_prisma_migrations` 是“哪些迁移已应用”的唯一事实来源；本地迁移目录必须与账本一一对应。
- **已应用迁移不可改**：不得修改已应用迁移的 `migration.sql`、目录名、校验和，也不得删除迁移目录。
- **先备份、后迁移**：任何环境执行 `migrate deploy` 前必须有已完成并通过校验的备份；备份失败则禁止迁移。
- **禁止隐式破坏**：脚本与命令不得隐式重置数据库；不允许 `migrate reset`、`db push --force-reset`、`--accept-data-loss` 进入部署流程。
- **配置不落库**：`.env`、数据库文件、上传目录、备份目录均不提交版本库；`DATABASE_URL` 相对路径按 `server/prisma/` 解析。

## 2 命令总览

| 命令 | 作用 | 是否写入数据库 | 使用环境 |
|---|---|---|---|
| `npm run db:validate` | 校验 Prisma schema | 否 | 全部 |
| `npm run db:generate` | 生成 Prisma Client | 否 | 全部 |
| `npm run db:migrate:dev` | Prisma 开发迁移（可创建迁移） | 是 | 本地开发、一次性临时库 |
| `npm run db:migrate` | 部署迁移、执行 `db:verify`、打印连接参数 | 是 | 测试、生产 |
| `npm run db:migrate:deploy` | 仅执行 Prisma `migrate deploy` | 是 | 仅底层排障，不单独用于发布 |
| `npm run db:verify` | 只读核对本地迁移目录与账本 | 否 | 全部 |
| `npm run db:status` | 只读包装 Prisma `migrate status` | 否（拒绝不存在的库） | 全部 |
| `npm run db:check` | 校验 WAL、外键、`busy_timeout` 与账本 | 仅连接期 PRAGMA | 全部 |
| `npm run backup` | 创建并校验数据库与上传文件备份 | 只读源库，写入备份目录 | 全部 |
| `npm run db:reset` | 重建数据库，需显式确认 | 是，破坏性 | 仅本地/一次性临时库 |

`scripts/db-verify.ts` 只以 `readOnly` 方式打开已有数据库，不创建文件、不执行 PRAGMA 写入、不修改账本。`scripts/db-status.ts` 先检查数据库文件存在，避免 Prisma CLI 隐式创建空库。

## 3 迁移目录与命名

```text
server/prisma/
├─ schema.prisma
├─ migrations/
│  ├─ migration_lock.toml
│  └─ <yyyyMMddHHmmss>_<snake_case>/
│     └─ migration.sql
└─ .tmp/                 # 临时库，已被 .gitignore 忽略
```

- 目录名由 Prisma 生成：14 位 UTC 时间戳 + 下划线 + 小写蛇形描述，例如 `20261021143602_query_indexes`。
- 目录名前缀决定应用顺序；不得手工调整时间戳来“插队”。
- 一个迁移只做一件事，SQL 必须可重复审查；禁止在迁移中写入业务种子数据、密钥或环境变量值。
- 涉及表结构或索引变化时，同步更新 `docs/er.md`，并由 `server/tests/docs.spec.ts` 校验文档与 schema 一致。

## 4 新增迁移（开发）

1. 修改 `server/prisma/schema.prisma`。
2. 用一次性临时库生成迁移，避免影响真实库：

   ```bash
   DATABASE_URL="file:./.tmp/migration-create.db" npx prisma migrate dev \
     --create-only --name <snake_case> \
     --schema server/prisma/schema.prisma
   ```

3. 审查 `server/prisma/migrations/<timestamp>_<name>/migration.sql`：确认无意外删表、删列、清空数据；SQLite 重建表的场景要核对数据复制与索引、外键、唯一约束。
4. 在空库上完整演练：

   ```bash
   DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:migrate
   DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:verify
   DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:status
   DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:check
   ```

5. 更新本文第 9 节的“迁移清单与所有权”，写明迁移内容、负责人与引入工作包。
6. 运行 `npx tsc --noEmit` 与 `npm test`，确认全量通过后再提交。

禁止直接对 `data/genealogy.db` 执行 `migrate dev` 来生成迁移；开发迁移只能作用于临时库。

## 5 部署迁移（测试、生产）

### 5.1 迁移前检查

```bash
npm run db:status
npm run db:verify
```

- `db:status` 必须显示数据库已是最新，或只列出本次计划应用的迁移。
- `db:verify` 必须返回 `[db:verify] OK`；出现 `MIGRATIONS_PENDING`、`MIGRATIONS_UNKNOWN`、`MIGRATIONS_FAILED`、`MIGRATIONS_DUPLICATE` 或 `MIGRATIONS_ORDER_MISMATCH` 时不得继续。
- 核对第 9 节迁移清单与本次发布内容一致。

### 5.2 强制迁移前备份

1. 停止写入流量或停止服务，确保没有进程正在写数据库。
2. 执行备份：

   ```bash
   npm run backup
   ```

3. 备份脚本会创建 `data/backups/<UTC 时间戳>/`，并自动完成 `integrity_check`、逐表行数、数据库 SHA-256 与上传文件计数校验。只有看到 `[backup] OK` 才能继续。
4. 记录备份目录名与 `manifest.json` 中的数据库哈希；将备份复制到受控的异地位置。
5. **备份失败、校验失败或无法确认备份位置时，禁止执行迁移。**

备份包含在世人物信息，按敏感数据处理；不得通过网盘、聊天工具或公开链接传输。

### 5.3 执行迁移

```bash
npm run db:migrate
```

该命令依次执行：

1. `prisma migrate deploy` 应用尚未执行的迁移；
2. `db:verify` 只读核对本地目录与账本，输出 `[db:migrate] verify=ok ...`；
3. `initializeDatabase` 应用并回读 WAL、外键、`busy_timeout`，确认账本非空；
4. 输出 `[db:migrate] OK`。

任一步失败都会以非零退出码结束，服务不得启动。

### 5.4 迁移后检查

```bash
npm run db:verify
npm run db:status
npm run db:check
```

确认三项均成功、`journal_mode=wal`、`foreign_keys=on`、`busy_timeout=5000`，再启动服务并执行健康检查与关键页面抽查。

## 6 回滚策略（恢复式回滚）

迁移失败或发布必须撤回时，采用“停止 → 保留现场 → 恢复备份 → 校验 → 修复后重新部署”的流程：

1. 停止服务，禁止继续写入。
2. 保留失败现场：将当前数据库、`-wal`、`-shm` 与 `uploads/` 复制到隔离目录，供事后分析；不要在原库上反复重试。
3. 用迁移前备份覆盖数据库：复制备份集中的 `genealogy.db` 到 `DATABASE_URL` 指向的位置。
4. 删除旧的 `-wal` 与 `-shm` 文件；旧 WAL 与新主库文件混用会造成数据损坏。
5. 用备份集中的 `uploads/` 恢复上传目录。
6. 执行 `npm run db:verify`、`npm run db:status`、`npm run db:check`，确认账本与连接参数正常。
7. 修复迁移或代码后，重新走第 5 节的“备份 → 部署 → 校验”流程。

注意：备份之后产生的数据会随恢复丢失；恢复前必须确认可接受的数据损失窗口，并通知相关使用方。

## 7 失败迁移处理

`db:verify` 发现 `finished_at IS NULL` 且未回滚的记录时返回 `MIGRATIONS_FAILED`。处理顺序：

1. 停止服务，按第 6 节恢复迁移前备份；这是首选方案。
2. 只有在确认数据库没有“半应用”状态、且已完成备份的前提下，才可由负责人评估是否使用 Prisma 的 `migrate resolve --rolled-back <migration_name>` 标记失败记录，再修复迁移并重新部署。
3. 不得手工 `INSERT`、`UPDATE` 或 `DELETE` `_prisma_migrations` 记录来“消除”错误。
4. 本地一次性临时库可以直接删除后重建；测试/生产库不得使用重置命令代替修复。

## 8 测试库重建与回滚演练

所有演练必须使用 `server/prisma/.tmp/` 下的一次性数据库，不得指向 `data/genealogy.db`。

### 8.1 空库重建

```bash
DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:migrate
DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:verify
DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:status
DATABASE_URL="file:./.tmp/migration-drill.db" NODE_ENV=test npm run db:check
```

### 8.2 备份与恢复演练

```bash
UPLOAD_DIR=".tmp/drill/uploads" \
BACKUP_DIR=".tmp/drill/backups" \
DATABASE_URL="file:./.tmp/migration-drill.db" \
NODE_ENV=test npm run backup
```

记录输出中的备份目录，然后：

1. 在临时库中执行一次可识别的变更（例如插入一条测试记录或删除一条迁移账本记录）。
2. 确认 `npm run db:verify` 按预期失败。
3. 停止所有连接，删除临时库的 `-wal`、`-shm`，用备份中的 `genealogy.db` 覆盖临时库。
4. 重新执行 `db:verify`、`db:status`、`db:check`，确认恢复成功。
5. 删除本次演练的临时库、上传与备份目录。

自动化测试 `server/tests/db-verify.spec.ts` 覆盖同一流程。

## 9 迁移清单与所有权

| 迁移目录 | 内容 | 负责人 | 引入工作包 | 状态 |
|---|---|---|---|---|
| `20261021093501_init` | 初始 15 个模型、约束与索引 | 技术负责人 | 3.1.1 | 已提交 |
| `20261021143602_query_indexes` | 查询复合索引替换冗余单列索引 | 技术负责人 | 3.2.2 | 已提交，待部署 |
| `20261022064442_audit_append_only` | `AuditLog` 只追加触发器，禁止 UPDATE/DELETE | 技术负责人 | 2.1.3 | 已提交，待部署 |

新增迁移时必须在此表追加一行；迁移目录被删除或改名时同步更新。`server/tests/migration-docs.spec.ts` 会校验表格与 `server/prisma/migrations/` 目录完全一致。

## 10 自检结果与错误码

`npm run db:verify` 成功输出：

```text
[db:verify] NODE_ENV=test
[db:verify] database=server/prisma/.tmp/migration-drill.db
[db:verify] local_migrations=2
[db:verify] applied_migrations=2
[db:verify] OK
```

失败时输出 `[db:verify] FAILED MigrationVerificationError [错误码]: 说明`，并以退出码 1 结束。

| 错误码 | 含义 | 处理 |
|---|---|---|
| `DATABASE_MISSING` | 数据库文件不存在、不是普通文件或无法只读打开 | 先确认 `DATABASE_URL`，再执行 `npm run db:migrate` |
| `MIGRATIONS_DIR_MISSING` | 本地迁移目录不存在或不可读 | 检查 `server/prisma/migrations/` 是否完整 |
| `MIGRATIONS_LEDGER_MISSING` | 数据库缺少 `_prisma_migrations` 表 | 数据库未初始化；执行 `npm run db:migrate` |
| `MIGRATIONS_PENDING` | 本地存在尚未应用的迁移 | 备份后执行 `npm run db:migrate` |
| `MIGRATIONS_UNKNOWN` | 账本中的迁移在本地目录不存在 | 停止发布，恢复正确版本的迁移目录或备份 |
| `MIGRATIONS_FAILED` | 存在未完成且未回滚的迁移 | 按第 7 节恢复备份后修复 |
| `MIGRATIONS_DUPLICATE` | 同一迁移名在账本中出现多条有效记录 | 停止发布，恢复备份并排查账本 |
| `MIGRATIONS_ORDER_MISMATCH` | 账本应用顺序与本地目录顺序不一致 | 停止发布，核对迁移目录与账本 |

## 11 禁止操作

以下操作不得进入脚本、CI 或部署流程：

- `prisma migrate reset`（测试/生产环境绝对禁止；本地一次性库也需显式确认）。
- `prisma db push --force-reset`。
- 任何带 `--accept-data-loss` 的 Prisma 命令。
- 手工修改、删除 `_prisma_migrations` 记录。
- 修改或删除已应用的迁移目录与 `migration.sql`。
- 未完成备份或备份校验失败时执行 `migrate deploy`。
- 直接对 `data/genealogy.db` 运行开发迁移或演练命令。
- 将 `.env`、数据库文件、`uploads/`、`backups/` 提交到版本库。

`server/tests/migration-docs.spec.ts` 会扫描 `package.json` 与 `scripts/`，确保危险命令不会进入自动化入口。
