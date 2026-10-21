# 文件存储与备份恢复（3.2.2）

> 适用版本：Spec v1.0（校订 R2）。本文描述上传文件的落盘规范、目录配置约束，以及 `npm run backup` 的备份内容、校验方式和恢复步骤。

## 1 目录与配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `UPLOAD_DIR` | `./data/uploads` | 上传文件根目录，相对路径按项目根目录解析 |
| `BACKUP_DIR` | `./data/backups` | 备份集根目录，相对路径按项目根目录解析 |

约束（`server/src/config/env.ts` 的 `loadStorageConfig` 统一校验）：

- 两个目录都必须位于项目根目录内部，不允许指向项目外。
- 两个目录不能相同，也不能互相嵌套。
- 路径不得包含 NUL 字符。
- 目录不存在时由首次写入或备份自动创建；配置解析本身不创建目录。

`data/uploads/`、`data/backups/` 与 `*.db` 已被 `.gitignore` 忽略，不得提交到版本库。

## 2 上传文件规范

### 2.1 允许的类型与大小

| 扩展名 | 允许的 MIME | 用途 |
|---|---|---|
| `jpg` / `jpeg` | `image/jpeg` | 旧谱扫描图 |
| `png` | `image/png` | 旧谱扫描图 |
| `webp` | `image/webp` | 旧谱扫描图 |
| `txt` | `text/plain` | 旧谱文本 |
| `ged` | `text/plain`、`application/x-gedcom`、`text/vnd.familysearch.gedcom`、`application/octet-stream` | GEDCOM 文件 |

- 单文件上限：`10 * 1024 * 1024` 字节（`MAX_UPLOAD_BYTES`）。
- MIME 比较会去掉 `; charset=...` 等参数并转为小写。
- 空文件、扩展名不在白名单、扩展名与 MIME 不匹配均拒绝。
- 文件头（magic bytes）校验由 2.2.3 上传接口负责；本包只做扩展名、MIME、大小与文件名校验。

### 2.2 命名与落盘

- 原始文件名只用于展示与审计；落盘名统一为 `randomUUID() + 规范化扩展名`，例如 `3f2c...e1.png`。
- `Source.storagePath` 只保存随机文件名，不保存目录、不保存原始文件名。
- 文件平铺存放在 `UPLOAD_DIR` 下；`resolveStoredFile` 拒绝绝对路径、目录、`..`、隐藏文件、含 `/` 或 `\` 的路径，确保解析结果始终位于上传目录内部。
- 写入顺序为“同目录临时文件 → 原子重命名”，临时文件权限 `0600`；失败时清理临时文件并返回 `UPLOAD_WRITE_FAILED`。
- 保存成功后返回 SHA-256，用于重复文件提示与来源完整性核对。

### 2.3 访问控制

- 上传目录不得作为静态资源目录对外暴露。
- 文件下载必须经过认证与 RBAC 检查，以流式响应返回；VIEWER 不得获取来源原文件。
- 任何页面不得把 AI 返回内容或上传文件名直接拼接为 HTML。

## 3 备份

### 3.1 命令

```bash
npm run backup
```

脚本：`scripts/backup.ts`。脚本读取 `.env` 与当前进程环境，使用与 3.2.1 相同的 `DATABASE_URL`、`UPLOAD_DIR`、`BACKUP_DIR` 解析规则。

### 3.2 备份集结构

每次执行创建独立目录，目录名为 UTC 时间戳（同一毫秒冲突时追加序号）：

```text
data/backups/2026-10-21T14-36-02-123Z/
├─ genealogy.db      # VACUUM INTO 生成的一致性快照
├─ uploads/          # 上传目录的完整副本（可为空目录）
└─ manifest.json     # 清单与校验信息
```

`manifest.json` 字段：

| 字段 | 内容 |
|---|---|
| `formatVersion` | 固定为 `1` |
| `createdAt` | ISO-8601 时间 |
| `database.file` | 固定为 `genealogy.db` |
| `database.sizeBytes` / `database.sha256` | 备份数据库大小与 SHA-256 |
| `uploads.directory` | 固定为 `uploads` |
| `uploads.fileCount` / `uploads.totalBytes` | 上传文件数量与总字节数 |
| `tables` | 15 个核心模型的逐表行数 |

清单只记录相对文件名、计数、大小与哈希，不记录项目绝对路径、`.env`、JWT 密钥、AI API Key 或任何环境变量值。

### 3.3 一致性与校验

1. 用 `VACUUM INTO` 从源库生成快照；该快照包含 WAL 中已提交的数据，且不修改源库。
2. 递归复制上传文件；遇到符号链接、套接字等非普通文件直接失败，不跟随链接。
3. 对备份库执行 `PRAGMA integrity_check`，结果必须为 `ok`。
4. 逐表比较源库与备份库行数。
5. 重新计算备份库大小与 SHA-256，与清单比对。
6. 重新统计备份 `uploads/` 的文件数与字节数，与源目录比对。

任一步失败都会删除本次新建的备份集目录并返回非零退出码；已有备份集不会被修改或自动清理。

### 3.4 失败码

| 错误码 | 含义 |
|---|---|
| `BACKUP_DATABASE_MISSING` | 数据库文件不存在或不是普通文件 |
| `BACKUP_DIR_INVALID` | 上传/备份目录不在项目内、相互嵌套、不是目录，或数据库位于上传目录 |
| `BACKUP_FAILED` | 快照、复制或写入失败 |
| `BACKUP_VERIFY_FAILED` | integrity_check、行数、哈希或上传统计校验失败 |

### 3.5 保留策略

- 不自动删除旧备份；由运维按保留周期手工清理。
- 备份包含家谱个人信息，应按敏感数据处理：存放在受控位置，必要时加密，避免通过网盘或聊天工具传输。
- 备份目录不得放入 `UPLOAD_DIR`，避免备份被再次打包进下一次备份。

## 4 恢复步骤

恢复会覆盖现有数据，必须先停服务并保留当前现场。

1. 停止服务，确认没有进程正在写 `data/genealogy.db`。
2. 将当前 `data/genealogy.db`、`data/genealogy.db-wal`、`data/genealogy.db-shm` 与 `data/uploads/` 整体复制到临时安全位置。
3. 用备份集中的 `genealogy.db` 覆盖 `data/genealogy.db`。
4. 删除旧的 `data/genealogy.db-wal` 与 `data/genealogy.db-shm`；不要在旧 WAL 文件存在时启动服务。
5. 用备份集中的 `uploads/` 覆盖 `data/uploads/`（先清空当前目录，再复制备份内容）。
6. 执行 `npm run db:check`，确认 `journal_mode=wal`、`foreign_keys=1`、`busy_timeout=5000`，且迁移记录完整。
7. 启动服务，核对 `manifest.json` 中的逐表行数与页面统计是否一致。
8. 恢复验证完成后再删除第 2 步的临时安全副本。

## 5 验证

本包自动化覆盖：

- `server/tests/storage-config.spec.ts`：默认目录、相对/绝对路径、项目外路径、相同/嵌套目录、NUL、含空格路径、`.env` 读取。
- `server/tests/files.spec.ts`：随机命名、路径穿越与非法文件名、白名单与 MIME、10MB 边界、空文件、哈希、`resolveStoredFile`。
- `server/tests/backup.spec.ts`：备份内容、清单、integrity_check、行数、上传数量、恢复模拟、失败清理、含空格路径、清单不含密钥。
- `server/tests/indexes.spec.ts`：复合索引存在、旧冗余索引移除、查询计划使用目标索引、唯一约束保留。

手工验证（仅使用临时目录，不触碰真实数据）：

```bash
DATABASE_URL="file:./.tmp/backup-check.db" NODE_ENV=test npm run db:migrate
DATABASE_URL="file:./.tmp/backup-check.db" NODE_ENV=test \
  UPLOAD_DIR="./server/prisma/.tmp/upload-check" \
  BACKUP_DIR="./server/prisma/.tmp/backup-check" \
  npm run backup
```
