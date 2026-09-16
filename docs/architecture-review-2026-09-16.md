# 架构检查：Galaxy Home

检查日期：2026-09-16。范围：`src/`、`db/`、`tests/`、构建配置。以下数字均为本机实测，非估算。

## 一、总评

分层、依赖方向、契约验证和类型纪律达到商业项目水准；主要债务集中在**两代实现并存**和**单个超大文件**上，且都发生在 AI 相关模块。

| 维度 | 结论 | 关键证据 |
|---|---|---|
| 分层与依赖方向 | 优秀 | client / server / shared 三层，零违规 import |
| API 契约 | 优秀 | `apiRequest(path, schema)` 的 schema 是必填参数 |
| 类型纪律 | 优秀 | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`；0 个 `any`、0 个 `@ts-ignore`、0 个非空断言 |
| 数据访问 | 优秀 | 243 处参数化查询，无字符串拼接 |
| 测试 | 优秀 | 16161 行，测试/源码 0.56；integration 59 个为主体 |
| 服务端组织 | 良好 | 路由 10 模块、平均 118 行；但有 1 个 1243 行服务 |
| 前端状态 | 良好 | 以 URL 派生为主，1 处遗漏 |
| 样式 | 良好 | 6780 行，静态类名使用率 89% |
| 构建产物 | 待优化 | `HabitsPage` 362 KB（recharts 未懒加载） |
| 文档 | 良好 | ADR 2 份、pitfalls 6 份；缺架构总览 |

代码量：源码 28970 行（client 14188 / server 12945 / shared 1837，共 247 文件），测试 16161 行（127 文件）。
运行时依赖 20 个，均为主流库（React 19、react-router 7、react-query 5、zod 4、fastify 5）。

## 二、做得好的地方

**依赖方向是干净的。** client 不 import server，shared 不 import 任何一端，server 不 import client。grep 三层均为零命中。shared 被 32 个 client 组件和 25 个 server repository 同时使用，是真正的共享层而非杂物层。这一点很多中型项目做不到。

**契约验证是强制的，不是可选的。** `apiRequest<T>(path, schema: ZodType<T>, init?)` 把 schema 作为必填参数，忘记验证会编译失败。error body 也走 `errorSchema.safeParse`，失败降级为 `NETWORK_ERROR`。整个 API 层（api / schemas / queries / mutations）只有 328 行。

**类型纪律近乎苛刻。** `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes` 是两个常被关掉的开关，这里都开着。0 个 `any`、0 个 `@ts-ignore`、0 个非空断言，意味着没有任何一条逃生通道被使用。

**数据层没有取巧。** 243 处 `.prepare()` 全部参数化。SQL 错误（`ItemVersionConflictError` 等）是带类型的类，在 `app.ts` 集中映射为 HTTP 语义（27 个分支），客户端按 code 分支处理。

**测试是资产而非负担。** integration 59 个文件是主体，说明复杂逻辑在服务端被直接测试，而不是全部压给 E2E。本轮 395 个单元测试 + 62 个 E2E 全绿，E2E 用两个视口跑同一批文件。

**路由与迁移克制。** 10 个路由模块共 1177 行；11 个迁移文件共 552 行，线性演进、无改写历史。路由通过 `register*Routes(app, context)` 显式注入依赖。

**样式不是垃圾场。** 29 个文件 6780 行，静态扫描 517 个类名中 456 个能匹配到引用（89%）。`product.css` 与 `workspace.css` 各自聚合子文件，两套的类名无冲突——是分层历史，不是双份实现。

## 三、需要处理的

### ✅ 已解决 — `aiChatActions.ts` 是 1243 行单文件

**2026-09-16 完成拆分**，见 `src/server/services/aiChat/`。原文件保留为 12 行的 re-export 入口，调用方路径未变。结果：

| 模块 | 内容 | 行数 |
|---|---|---|
| `context.ts` | 执行单个动作时共享的上下文 | 13 |
| `refs.ts` | 实体引用解析、别名记忆 | 108 |
| `parsing.ts` | 从回答里抠 JSON、修复截断 | 154 |
| `normalize.ts` | 宽松模型输出的规范化 | 275 |
| `summary.ts` | 摘要文案与操作记录 | 84 |
| `today.ts` | 今日标记 | 47 |
| `handlers.ts` | 动作分发器 | 69 |
| `handlersItem.ts` / `handlersOrganization.ts` | 14 个动作的实现 | 200 / 173 |
| `apply.ts` | 整轮应用与系统提示词 | 187 |

原 317 行的 `executeChatAction` 拆成每个动作一个具名函数，分发器只做查表；各动作体原本直接引用 `database`/`settings`/`localDate`/`refs`/`instant` 自由变量，现统一走 `context` 参数。

行号引用已过时：`countPrimaryTodayItems` / `fitTodayActions` 在同一轮里随「今日主位上限」一起删除了。

### P1 — `planning` 与 `taskPlanning` 是两代同构实现

两套表几乎逐字段相同：

```sql
-- 010
CREATE TABLE plan_runs (id, state_json, owner_pid, lease_until_ms, created_at, updated_at)
-- 011
CREATE TABLE task_plan_runs (id, state_json, created_at, updated_at, owner_pid, lease_until_ms)
```

服务端同构（`generate` / `edit` / `proposal` / `store` 命名一致），客户端同构（都有 proposal 编辑器和 run 详情页）：

| 层 | planning | taskPlanning | 合计 |
|---|---|---|---|
| server/services | 699 行 / 6 文件 | 1007 行 / 7 文件 | 1706 行 |
| client/components | 522 行 / 4 文件 | 1455 行 / 12 文件 | 1977 行 |

两者面向的场景确实不同（`/plans` 是"知识→行动计划"，`/task-plans` 是"自然语言→任务或按容量重排日历"），且新套多了 `capacity.ts` / `validate.ts` / `confirm.ts`。但 lease 管理、run 状态机、proposal 生命周期、草稿编辑是重复的。

可选路线，按代价从低到高：

1. 抽出共享的 AI run 框架（lease + 状态机 + proposal 生命周期），两套只保留业务策略；
2. 评估 `/plans` 能否由 `/task-plans` + 笔记覆盖，直接退役旧套（`plan_runs` 保留只读）；
3. 维持现状，但在文档中写清两者的边界与不合并的理由。

这是产品判断，不是纯技术判断——需要你决定。

### ✅ 已解决 — 错误码是散落的字符串字面量

**2026-09-16 完成**。`src/shared/errorCodes.ts` 收录 65 个业务码作为唯一真相源，两端共 61 处引用改为 `ERROR_CODES.X`。`ApiError.code`、`AiServiceError.code`、`TaskPlanError.code` 收窄为 `ErrorCode` 联合类型。

收窄当场见效：第一次 typecheck 就报出 10 个 grep 漏掉的码（`TASK_PLAN_*` 系列），它们是 `TaskPlanError` 的位置参数，形式为 `throw new TaskPlanError("X", ...)`，最初的收集脚本只扫 `code: "X"` 没覆盖到。

边界处不做断言：`shared` 导出 `errorCodeSchema`，客户端 `throwApiError` 与流式 error 事件各校验一次，失败落到 `INTERNAL_ERROR` 而不是笼统的 `NETWORK_ERROR`。

`EADDRINUSE`、`UND_ERR_CONNECT_TIMEOUT` 未进表——它们由 Node/undici 抛出，不是本服务定义的码。

### P2 — `HabitsPage` 打包 362 KB

它是最大的产物，也是最小的页面之一。原因明确：`HabitTrend.tsx` 引入 recharts，而全仓只有这一处用 recharts。把 `HabitTrend` 改为 `React.lazy` 可让该页首屏降到几十 KB。其余页面都已按路由分割（`router.tsx` 用 `lazy`）。

### P2 — `TodosPage` 的优先级过滤没有 URL 化

`view` 和 `categoryId` 已从 URL 派生（本轮修掉了它们与 `useState` 的同步竞态），但 `priority` 仍是本地 `useState`（`TodosPage.tsx:60`）。后果：刷新后过滤丢失，链接无法分享。同类状态应当同一种处理方式。

### P2 — 创建任务时会触发一次无人消费的 AI 调用

**本轮自查新发现**。`POST /api/items` 每次都调 `queueCaptureAnalysis`（`routes/items.ts:76`），它经 `suggestItemCategories` → `chatStructured` 发起一次真实模型调用，结果只写进 `item_ai_suggestions` 表。

而该表在客户端没有任何读取入口。唯一读过它的 `GET /api/items/:id/ai-suggestion` 在死端点清理里被删除（删除本身是对的——客户端从未调用它），同文件的另外两个导出让 capture 流程仍能写入。结果是：配了 AI 的环境里，每个新建任务都花一次调用，产出无人消费。

注意这条不是删除端点引入的，删除只是让"只写不读"变得明显。另一个消费路径 `POST /api/ai/suggest-categories` 是活的，`OrganizeDialog` 在用，未受影响。

需要产品判断：给建议接上读取入口（例如收集箱里标出"AI 建议归入某分类"），或关掉这条自动分析。在决定之前不动——删表涉及迁移，补 UI 是产品决策。

### P3 — `app.ts` 的 27 个 `instanceof` 分支

87 行的 if-else 链把错误类映射为 HTTP 语义。功能正确、位置正确，但新增错误类型要改这个文件。可换成映射表，收益中等、风险低。优先级不高。

### P3 — UI 基础组件只有 9 个

`ui/` 下 9 个（Button / EmptyState / Feedback / Field / IconButton / ModalSurface / NaturalText / QueryFeedback / Status），而 `components/` 下 54 个。不一定有问题——业务组件本就该多于原语——但值得抽查是否存在重复实现的按钮/空态/弹窗语义。

## 四、本次修复暴露的架构模式问题

CI 上 `core.spec.ts` 偶发失败，根因是**数据库触发器隐式扩展了 `version` 的语义**：

```sql
CREATE TRIGGER today_items_insert_version AFTER INSERT ON today_items BEGIN
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id;
END;
```

设计意图清晰——`version` 要反映所有影响任务状态的业务变化，包括分类、项目、今日标记。但前端按"只有编辑才改版本"的直觉编码：加入今日时携带列表里的 `expectedVersion`，服务端写入后版本 +1，用户紧接着点"设为今日重点"仍带旧版本，于是 409。

**这不是并发冲突**，是客户端自己制造的版本推进。触发器的存在让版本变化脱离了"用户可见的编辑动作"这一直觉，而契约文档只写了"必须传版本"，没写"连续操作会撞上自己"。

本次采用的处理：今日标记（`PUT`/`DELETE /api/items/:id/today`）不再携带 `expectedVersion`，理由是它按绝对值 UPSERT/DELETE、不做读-改-写、不存在丢失更新；同时把这条例外和原因补进了 `docs/task-time-model.md`。锁定该行为的回归用例在 `tests/e2e/workspace-maturity.spec.ts`，把版本字段加回去会让它失败。

同一模式还适用于：**任何有触发器副作用的幂等操作**。新增触发器时应同步回答"客户端如何得知版本已变"。

## 五、建议顺序

1. ~~**拆分 `aiChatActions.ts`**~~ — **已完成**（2026-09-16，见上）。
2. ~~**决定 `planning` 去留**~~ — **已完成**：并入 `taskPlanning` 作为 plan 模式，旧实现已退役。 — 需要产品判断，越早越好，因为它决定后续在哪套上加功能。
3. ~~**错误码集中到 `shared/`**~~ — **已完成**（2026-09-16，见上）。
4. ~~**`HabitTrend` 懒加载**~~ — **已完成**：recharts 独立成 352 kB chunk，首屏不再包含。
5. ~~**`TodosPage.priority` URL 化**~~ — **已完成**：筛选状态统一由 URL 承载，新增 E2E 覆盖。

未在本次检查中覆盖：真实模型行为、Tauri 打包、Windows 桌面路径、并发压力下的 SQLite 表现。这些需要对应平台的实测，不能由静态检查代替。
