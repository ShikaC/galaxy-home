# 融合方案：planning 并入 taskPlanning

决策：把「知识计划」（`planning`）收敛为「AI 任务」（`taskPlanning`）的一种模式，共享 run 框架，保留其独有能力。日期 2026-09-16。

**状态：已完成。** 8 个阶段全部落地，`npm run eval` 30/30，vitest 98 文件 / 374 测试，E2E 默认套件 56/56 + task-time 套件 8/8。`/api/plans`、`src/server/services/planning/`、`PlansPage`、`components/planning/`、导航项均已退役。

## 一、为什么不是简单删除

两套能力不重叠，交集只有 run 框架：

| | planning | taskPlanning |
|---|---|---|
| 输入 | `goal` + `contextMode` | `originalText` |
| 独有能力 | 检索笔记与已有任务 → 生成计划 | 容量校验、日历重排 |
| 写任务路径 | 直接 SQL 写 `items` | `createItem` / `updateItem` |
| 评测 | `npm run eval` 全建在其上 | 仅 E2E |

直接删除会同时失去「从笔记规划」和 30 个 case 的 AI 质量门禁。融合还能顺带修掉 planning 绕过 repository 写库的问题。

**状态机两套完全一致**（`planning` / `awaiting_confirmation` / `needs_input` / `succeeded` / `failed` / `cancelled`），这是融合的支点。

## 二、历史数据

已核对全部真实数据库（`data/galaxy-home.sqlite`、桌面库、12 份备份）：**均无 `plan_runs` 与 `task_plan_runs` 表**，桌面库停在迁移 010 之前（items 2 条、habits 1 条）。因此**无需数据迁移，也没有向后兼容负担**。

`db/migrations/010_plan_runs.sql` 保留不改（迁移是历史记录）；`plan_runs` 表不再写入，代码侧不再引用。

## 三、目标结构

```
taskPlanInputSchema = discriminatedUnion("type", [capture, replan, plan])
taskPlanProposalSchema = discriminatedUnion("kind", [capture, replan, plan])
```

新增的 `plan` 类型承接 planning：

```ts
{
  type: "plan",
  requestId, goal, startDate, horizonDays,
  contextMode: "goal_only" | "workspace",
}
```

proposal：

```ts
{ kind: "plan", summary, clarification, tasks: planTaskDraft[] }
// planTaskDraft = { draftId, title, dayOffset, reason, sourceIds, existingItemId }
```

计划不涉及分钟数（用户决定）：没有每日预算输入，草稿不带 `minutes`，确认时不写 `estimatedMinutes`。计划只回答“做什么、哪天做”。

`taskPlanRunSchema` 增加两个**可选**字段（仅 plan 类型填充）：

```ts
sources: planSource[],        // 检索到的笔记
existingItems: planItem[],    // 参与复用的活动任务
```

## 四、分阶段实施

| 阶段 | 内容 | 验证 |
|---|---|---|
| 1 | `shared/taskPlanning.ts` 扩展三种类型 + run 字段 | ✅ typecheck |
| 2 | 迁移 `retrieval.ts`；`generate.ts` 支持 plan 类型 | ✅ 集成测试 |
| 3 | `proposal.ts` / `edit.ts` / `validate.ts` 支持 plan proposal | ✅ 集成测试 |
| 4 | `confirm.ts` 支持 plan 的确认（改用 `createItem` + `setTodayItem`） | ✅ 集成测试 |
| 5 | 路由：`/api/task-plans` 接受 plan；退役 `/api/plans` | ✅ 集成测试 |
| 6 | 客户端：TaskPlanningComposer 增加「从笔记做计划」；退役 PlansPage 与 `components/planning/` | ✅ E2E |
| 7 | 评测：`evaluation/*` 改到 plan 类型 | ✅ `npm run eval` 30/30 |
| 8 | 清理：删除 `services/planning/`、导航项；`shared/planning.ts` 仅留作旧备份读取 | ✅ 全量测试 |

每阶段独立提交，避免一次性大改无法定位回归。

评测迁移时发现一个真实缺陷：`snapshot.ts` 只把 `plan_runs` 排除在“确认前无写入”快照之外，新流程写的是 `task_plan_runs`，导致 `noWritesBeforeConfirmation` 全数误判为失败。两代表名均已排除。

## 五、迁移时的等价性要求

planning 的 `executePlan` 目前直接：

```sql
INSERT INTO items (...) VALUES (...)          -- 绕过 createItem
INSERT INTO today_items (...) ON CONFLICT ... -- 绕过 setTodayItem
```

融合时改用 `createItem` + `setTodayItem`，需保持这些行为不变：

- **任务复用**：先按 `existingItemId` 匹配，否则按 `normalizedTaskTitle` 在活动任务里查同名。命中则复用而不是新建。
- **加入今日**：按 `planDate(startDate, dayOffset)` 全部作为主位写入（今日主位上限已取消）。
- **写入核验**：写完后读回标题与 `is_secondary`，标题不一致即视为失败并回滚整批。
- **执行幂等**：已是 `succeeded` 直接返回；`failed` 且 code 为 `EXECUTION_FAILED` 时允许重试。
- **乐观锁**：`expectedRevision` 与 run 的 revision 不符返回冲突，不覆盖用户编辑。

改走 repository 后新增的行为差异（属修复，需在测试中确认）：

- 任务版本会因 today 标记经触发器递增，客户端不再持有过期版本；
- `createItem` 的 `requestId` 防重、教程任务转换、父子约束等既有规则开始对 plan 创建的任务生效。

## 六、不做什么

- 不迁移 `plan_runs` 的历史行（无数据）。
- 不保留 `/api/plans` 的兼容层（无外部消费者）；`shared/planning.ts` 保留 `planRunSchema`，仅用于备份恢复读取旧备份里的 `plan_runs` 表。
- 不把 replan 的日历冲突检测强加给 plan 模式：plan 只按 `horizonDays` 分配日期，不做冲突检查。
