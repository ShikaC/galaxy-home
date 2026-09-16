# 命名与接口一致性审计

审计日期：2026-09-16。方法：提取全部 110 个 HTTP 端点与全部导出函数，按「调用方是否存在」「语义是否重叠」交叉核对。以下每条都附可复现的检查依据。

## 一、功能相同但名字不同 —— 已确认并修复

### 1. 分类关系写入有两份实现

| 实现 | 位置 | 事务 |
|---|---|---|
| `replaceCategoryRelations` | `repositories/itemMutations.ts:117` | 不管理，由调用方包裹 |
| `replaceItemCategories` | `repositories/categories.ts:78` | 自己 `BEGIN IMMEDIATE` |

两份 SQL 逐字相同（`DELETE FROM item_categories` + 循环 `INSERT`）。

**后果不是代码冗余，是真实故障**：`undoAiAction`（`aiActions.ts:271`）自己已经 `BEGIN IMMEDIATE`，内部却调用会再开一次事务的旧实现。用户撤销「AI 修改任务分类」时直接失败：

```
Error: cannot start a transaction within a transaction
  ❯ replaceItemCategories src/server/repositories/categories.ts:83
  ❯ undoAiAction src/server/repositories/aiActions.ts:405
```

该路径此前无测试覆盖，所以长期未暴露；执行路径因为恰好没有外层事务而一直正常。

### 2. 项目关系写入同样有两份

`replaceProjectRelations`（`itemMutations.ts:131`）与 `replaceItemProjects`（`projectRelations.ts`，已删）结构完全对应，问题同源。

### 修复内容

撤销与执行路径统一改用不管理事务的实现；两份重复实现与其专属端点一并删除。回归测试 `tests/integration/aiActionUndo.test.ts`。

## 二、一个功能对应多个接口

### 1. 任务关联分类/项目（已删冗余）

| 接口 | 调用方 |
|---|---|
| `PATCH /api/items/:id`（body 带 `categoryIds`/`projectIds`） | `OrganizeDialog.tsx:85` —— 前端实际在用 |
| `PUT /api/items/:id/categories` | **无任何调用方** |
| `PUT /api/items/:id/projects` | **无任何调用方** |

同一件事有两条写入口，其中一条从未被使用。已删除两个 PUT 端点，保留 PATCH。

### 2. 四个无调用方的端点（未处理）

| 端点 | 状态 |
|---|---|
| `GET /api/items/:id/ai-suggestion` | 端点与 `getItemAiSuggestion` 均只被自身引用 |
| `POST /api/quote/next` | 端点与 `nextDailyQuote` 均只被自身引用 |
| `POST /api/ai/messages/:messageId/dismiss-memory` | 端点与 `clearMessageProposedMemory` 均只被自身引用 |
| `POST /api/calendar/validate` | 端点无调用方；但底层 `validateScheduleChanges`/`buildCalendarSnapshot` 被 `taskPlanning` 内部使用，**不可删函数，只能删端点** |

前三项是端点连同底层函数一起的无用代码。第四项要区分对待。

### 3. 四个名字围绕「加入今日」

`setTodayItem`（`todayItems.ts`）、`addToTodayOrSecondary`（同文件）、`addCurrentProjectTaskToToday`（`projectRecommendations.ts`）、`AddCurrentTaskToToday`（组件）。

不是重复实现——职责确实不同（通用写入 / 默认次要 / 项目当前任务 / 表单组件）——但同一个业务概念散在四个模块，检索时容易漏看。

## 三、事务管理两套风格

| 风格 | 文件数 | 嵌套保护 |
|---|---|---|
| 手写 `database.exec("BEGIN IMMEDIATE")` | 19 | **无** |
| `withImmediateTransaction`（`transaction.ts`） | 8 | **有**（`if (database.isTransaction) return operation()`） |

根因就在这张表里：helper 已经处理了嵌套，但大部分旧代码没有迁移。上面第一节的故障正是「手写事务 + 调用另一处手写事务」的组合。

文档已写明这条规则：

> 外层事务负责 AI 批量操作；repository 提供可在现有事务内调用的写入路径，避免嵌套 BEGIN。

**建议**：把手写事务逐步迁到 `withImmediateTransaction`，优先迁移会被复用的写入函数（`replaceReminderRules`、`moveToTrash`、project 系列的 stage/advance）。

## 四、两代实现并存

`planning`（`plan_runs`）与 `taskPlanning`（`task_plan_runs`）表结构逐字段同构，服务端同名 `generate`/`edit`/`proposal`/`store`。规模：服务端 1706 行、客户端 1977 行。

已按决定走退役路线（见下一节）。

## 五、不是缺陷的命名分歧

**`read` vs `get`**：`readItem` / `readItemRows` / `readHabitRows` / `readProject` 接收数据库行、映射为领域对象，每个只被同目录的 repository 调用；`getItem` / `listItems` 执行业务查询后再调用它们。**这是清晰的两层**，只是 `read` 这个动词同时承担「行映射」与「读取」两种含义（`client/lib/theme.ts` 的 `readStoredTheme`、`taskPlanning/store.ts` 的 `readTaskPlan` 是后者）。

**`advance` vs `complete`**：`POST /api/projects/:id/advance` 与 `POST /api/projects/:id/stages/advance` 由不同表单调用，页面按 `awaitingNextStage(project)` 二选一渲染，是同一流程在不同状态下的两个入口，不是重复接口。

**`recordHabit` vs `setHabitLog`**：前者是原子增量（服务端读当前值再 +1，避免客户端读-改-写），后者是按值修正（历史补记）。职责互补，但二者重复了 `habit_logs` 的 UPSERT SQL——`setHabitLog` 可以复用 `writeLog`（需给它加 status 参数）。

## 六、核对脚本

```bash
# 列出端点与前端调用（模板字符串路径也能匹配）
python3 - <<'PY'
import re, glob, os
eps = []
for p in glob.glob("src/server/routes/*.ts"):
    t = open(p, encoding="utf-8").read()
    eps += [(m.group(1).upper(), m.group(2)) for m in
            re.finditer(r'app\.(get|post|put|patch|delete)\("(/api/[^"]+)"', t)]
def src(root):
    out = ""
    for r, _, fs in os.walk(root):
        for f in fs:
            if f.endswith((".ts", ".tsx")): out += open(os.path.join(r, f), encoding="utf-8").read()
    return out
client = src("src/client") + src("src/shared")
def rx(p):
    parts = re.split(r"(:\w+|\$\{[^}]*\})", p)
    return "".join("[^\"'`]+" if (x.startswith(":") or x.startswith("${")) else re.escape(x) for x in parts)
for m, p in eps:
    if not re.search(rx(p), client): print(m, p, "→ 前端无调用")
PY
```

**注意**：端点路径含变量拼接时（如 `/api/habits/${id}/${action}`），按字面量检索会误报为未使用。第一节的判断都在此脚本基础上做了人工核对。
