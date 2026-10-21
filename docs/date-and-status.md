# 部分日期、人物状态与版本规范

> 对应工作包：`3.1.2`。实现入口：`shared/src/types/partial-date.ts`、`shared/src/utils/date.ts`、`shared/src/utils/person-state.ts`、`shared/src/utils/version.ts`。
> 本规范不改变数据库结构；`Person.livingStatus` 的隐私判定由 `3.5.1` 定义，本包只处理 `Person.status`（ACTIVE/MERGED/DELETED）。

## 1. PartialDate

| 字段 | 类型 | 规则 |
|---|---|---|
| `year` | `number \| null` | 1–9999；缺失时为 `null` |
| `month` | `number \| null` | 1–12；有月份必须有年份 |
| `day` | `number \| null` | 有日期必须有月份和年份 |
| `dateText` | `string \| null` | 原文；去除首尾空白，空串归一为 `null` |
| `precision` | `YEAR/MONTH/DAY/UNKNOWN` | 未显式提供时，仅按已有分量推断 |
| `approximate` | `boolean` | 约值标记，默认 `false` |
| `calendar` | `SOLAR/LUNAR/UNKNOWN` | 默认 `UNKNOWN`，不猜测历法 |

不变量：

- 缺失的年/月/日保持 `null`，禁止用 `1 月 1 日`、当月天数等值填充。
- 只有原文、没有可解析分量时，`year/month/day` 均为 `null`，`precision=UNKNOWN`。
- `precision=DAY` 要求年、月、日齐全；`MONTH` 要求年和月且日期为空；`YEAR` 要求年份且月/日为空。
- 公历闰年按 4/100/400 规则判断；农历最多允许 30 日，不实现闰月编号。
- 非法日期通过 `PartialDateValidationError.issues[].code` 返回稳定错误码，不静默修正。

## 2. 区间比较

`buildDateInterval` 将部分日期展开为可能区间：

| 精度 | 区间 |
|---|---|
| 年 | 当年 1 月 1 日 – 12 月 31 日 |
| 月 | 当月 1 日 – 当月最后一日 |
| 日 | 单日 |
| 无年份 | 无界（`start=end=null`） |

`comparePartialDates` 返回 `relation` 与 `certain`：

- `BEFORE` / `AFTER`：区间不重叠；
- `SAME`：区间完全相同；仅双方都是精确日时才 `certain=true`；
- `OVERLAPS`：区间重叠但不是同一区间，`certain=false`；
- `UNKNOWN`：任一方无年份，`certain=false`；
- 任一方 `approximate=true` 时，非 `SAME` 的确定性也降为 `false`，避免把约值当精确结论。

## 3. 年龄边界

`calculateAgeRange(birth, reference)` 以完整周岁计算：

- `min` = 参考时间最早可能点 − 出生时间最晚可能点；
- `max` = 参考时间最晚可能点 − 出生时间最早可能点；
- 任一方无年份返回 `null`；
- 只有年/月精度时返回区间且 `certain=false`；
- 双方均为精确日且非约值时才 `certain=true`；
- 不截断负值；负年龄表示数据顺序冲突，交由一致性校验处理。
- 闰日出生按实际日期比较，例如 2000-02-29 到 2001-02-28 为 0 周岁。

## 4. 约值与严重级

`downgradeIssueSeverityForApproximate`：只要参与判断的日期中存在 `approximate=true`，将 `ERROR` 降为 `WARNING`；`WARNING`、`INFO` 不变。问题详情仍需标注“日期为约值”，由校验模块（`3.4.1`）输出。

## 5. 人物状态生命周期

```text
ACTIVE ──合并批准──> MERGED
ACTIVE ──删除批准──> DELETED
MERGED / DELETED 为终态
```

- 同状态转换视为幂等允许；离开终态一律拒绝。
- 状态转换只校验合法性，不代替审核流程；合并/删除必须先通过 `2.6` 审核，管理员自批仍需二次确认与理由。
- 合并资格：双方 `ACTIVE`、同家族、不同人物、均无 `mergedIntoId`；`MERGED/DELETED` 人物禁止再参与合并。
- 软删除资格：仅无合并指向的 `ACTIVE` 人物；成功后写入 `status=DELETED`、`deletedAt` 与版本变更。
- 合并结果：源人物 `status=MERGED`、`mergedIntoId=保留者`；保留者保持 `ACTIVE`。`getMergeRedirect` 支持后续查询跟随到保留者。

## 6. 默认查询过滤

`buildDefaultPersonFilter()` 返回 `{ status: 'ACTIVE' }`；`filterDefaultVisiblePersons` 仅保留 `ACTIVE`。列表、树、亲缘查询默认应用该过滤；审计与合并追溯显式关闭过滤并遵守角色权限。

## 7. 版本规则

- `Person`、`Relation`、`Narrative` 的写操作携带当前 `version`。
- 请求版本与数据库当前版本不一致时抛出 `VersionConflictError`，由 API 映射为 `409`，不执行写入。
- 版本号必须是 ≥1 的整数，每次成功写入只 `+1`。
- `executeVersionedWrite` 先校验版本，再把递增后的版本交给写回调；回调失败时错误向上抛出，不返回新版本。持久化必须在调用方事务内完成，失败即回滚。
- 状态变更、合并、删除同样遵循版本规则，并与审核执行处于同一事务。

## 8. 测试映射

| 验收点 | 测试 |
|---|---|
| 可空且不伪造 | `shared/tests/date.spec.ts`：空日期、仅年份、仅原文 |
| 闰年/缺月/缺日 | `date.spec.ts`：2000-02-29、1900-02-29、缺月/缺日、4 月 31 日 |
| 区间/不确定比较 | `date.spec.ts`：年/月/日区间、重叠、无年份、约值 |
| 年龄边界 | `date.spec.ts`：精确年龄、闰日、年级精度、约值 |
| 约值降级 | `date.spec.ts`：ERROR→WARNING |
| 非法状态转换 | `person-state.spec.ts`：终态离开、同态、非法值 |
| 默认过滤/合并/软删除 | `person-state.spec.ts`：过滤、自合并、跨家族、已合并、软删除资格 |
| 版本只在成功后递增 | `version.spec.ts`：冲突、回调失败、成功递增 |
