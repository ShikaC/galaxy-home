# Galaxy 新版产品重构交接

更新时间：2026-09-16。交接状态：**M0–M3 已完成，首个任务 / 时间 / AI 重排完整场景已验证；实现已提交并合并到 `main`。「知识计划」已并入 AI 任务规划（plan 模式），旧 `/plans` 入口与 `services/planning/` 已退役。**

## 1. 接手顺序与目标

先阅读 [product-requirements.md](product-requirements.md)、本文、[current-task.md](current-task.md)、[README](../README.md) 和 [DESIGN.md](../DESIGN.md)。修改 AI 工作流前阅读 [agent-engineering.md](agent-engineering.md)；核验结果阅读 [task-time-validation.md](task-time-validation.md)、[agent-validation.md](agent-validation.md) 和 [live-model-usage.md](live-model-usage.md)。

产品目标是以任务和时间管理为中心的“类滴答清单 + AI”应用：AI 参与记录、整理、安排、执行、重排和回顾。新版实现优先保证任务语义、安排时段、重复实例、提醒、容量约束、可审查提案和旧数据兼容。

## 2. 当前代码与运行环境

| 项目 | 当前事实 |
| --- | --- |
| 仓库 | https://github.com/ShikaC/galaxy-home.git |
| 主检出 | `/Users/shika/Documents/galaxy-home`，分支 `main`，当前工作位置 |
| 实施工作树 | `/Users/shika/.codex/worktrees/galaxy-task-time-core/galaxy-home`（保留备用，与 `main` 同提交） |
| 分支 | `main`；`codex/task-time-core` 已合并，指向同一提交 |
| 接手基线 | `f1bb67c55db2ba878211b81e357f62da5d7edebf`（`实现任务时间核心与日历规划工作流`，156 文件 / +16627 −1073） |
| 上一版上游基线 | `4d438b0d2620c0d927a7d8a074485a01a5f85dd3` |
| Node / npm | Node `v24.18.0`、npm `11.16.0` |
| 前端 | React 19 + TypeScript + Vite |
| 服务端 | Fastify + SQLite + Zod |
| 开发前端 | `http://127.0.0.1:5173/` |
| 开发 API | `http://127.0.0.1:3001/` |
| 当前数据目录 | 主检出下 `data/`；迁移只在副本或合成库执行 |

启动：在主检出执行 `npm run dev`。它会构建服务端、启动 API、Vite 和 TypeScript watch。接手时重新运行 `git status --short --branch`、`git log -5 --oneline` 并确认端口和数据目录；文档中的路径与进程都是本机快照。

实现、测试与文档已全部提交，主检出工作树干净。真实用户数据库在本轮未被迁移或写入；新功能首次启动会按迁移流程升级目标库，操作前先备份。

## 3. 已完成的产品与技术能力

- Schema 011 与增量迁移：保留旧 `items` UUID、分类 / 项目关系、`today_items`、历史安排、AI 运行记录和备份恢复。
- 任务核心：优先级、单层父子任务、版本保护、截止日期 / 时间、预计耗时、连续安排时段、时区和固定事件。
- 重复任务：工作日、周 / 月规则、系列与实例分离、稳定发生键、单次跳过、删除墓碑、模板更新、持久物化游标、DST 错误隔离。
- 提醒：多提醒规则数组，兼容旧 `reminderMinutes`；修改规则会使旧待触发记录失效；snooze 使用持久 `requestId` 保证幂等。
- 日历：日 / 周视图、固定会议、空闲时间、容量检查、冲突检测和原子安排；今日、列表、详情和日历读取同一安排数据。
- AI：自然语言 capture、`task-plan-v2`、真实任务 / 日历上下文、持久运行、租约、取消、重试、严格 JSON Schema、提案编辑、快照版本校验、服务端冲突与容量校验、确认后读回核验。
- UI：任务编辑器、重复编辑器、子任务编辑器、日历编辑器、Task Planning 页面；覆盖响应式布局、中文长文本、日夜主题和失败 / 取消 / 断网 / 旧版本冲突后的手动继续。

关键边界：截止时间、安排时段和预计耗时始终分开；AI 不移动固定、已完成或锁定任务；父任务存在未完成子任务时不可完成；确认提案前必须重新读取快照并再次校验最终容量；提案冲突按执行后的最终日历状态计算。

## 4. 数据迁移与安全

迁移只在 SQLite backup API 副本和合成库验证，未写入真实用户库。主检出 `data/galaxy-home.sqlite` 与桌面 Application Support 数据库均保持 schema v8；两份副本均已升至 v11，旧业务表字段逐行一致，`integrity_check=ok`，外键违规为 0。备份、恢复、失败回滚、未来版本拒绝、v1/v2 备份兼容和旧关系保留均有定向回归。

新增创建、snooze、系列实例和计划运行均有持久身份与幂等逻辑。未知结果可安全重试；版本冲突返回 409 并保留未保存输入。永久删除分类 / 项目后，既有系列未来实例会过滤失效关系，新建系列仍拒绝不存在关系。

## 5. 已验证的首个完整场景

“每个工作日检查客户反馈，周五提交方案”已在真实 Playwright 浏览器中完成：自然语言 capture → 编辑识别结果 → 创建工作日系列与周五截止任务 → 添加子任务和估时 → 周日历安排 → 加入固定会议制造冲突 → AI 根据剩余容量重排 → 编辑提案 → 确认并读回 → 刷新 / 重启 → 后续重复实例与提醒继续运行。

场景同时验证了列表、详情、今日和日历的数据一致性；固定会议、已完成任务和明确约束受到保护；无法安排时返回冲突；旧版本确认被拒绝且保留输入；重复确认、重试和实例生成幂等；AI 失败、取消或断网后手动流程可继续。

证据目录：

- [scenario/results.md](../.omo/evidence/task-core/scenario/results.md)：4/4 浏览器验收结果。
- [scenario/e2e-final.log](../.omo/evidence/task-core/scenario/e2e-final.log)：最终 E2E 日志。
- [scenario/restart-results.json](../.omo/evidence/task-core/scenario/restart-results.json)：刷新 / 重启结果。
- [review-data-safety.md](../.omo/evidence/task-core/review-data-safety.md)：11 个集成测试文件、75 项安全复核及 7/7 对抗复现。
- [live-task-planning.md](../.omo/evidence/task-core/live-task-planning.md)：真实模型样本与 fixture 区分。

## 6. 验证结果与诚实边界

最终 release checks：`npm run lint` 通过（401 files，39 warnings、98 infos，无 error）；`npm run typecheck` 通过；`npm run build` 通过（Vite transformed 3026 modules）；`npm run test:e2e` 通过 50/50；定向重复、提醒、备份恢复和 AI / 日历复核全部通过。完整 Vitest 回归为 101 files / 392 tests PASS，发生在最终 CSS 视觉修复之前。

2026-09-16 在合并后的 `main`（`f1bb67c`）复核：`npx vitest run --exclude 'tests/e2e/**'` 为 **102 files / 395 tests PASS**（26.7 秒）；`npm run build` 通过；`npm run lint` 为 2 warnings（`lint/style/noDescendingSpecificity`，CSS）+ 103 infos（`lint/complexity/useLiteralKeys`，与 `noPropertyAccessFromIndexSignature` 冲突），无 error。本次复核只运行了 `tests/e2e/core.spec.ts`（2/2 通过），未重跑完整 Playwright 50 项。

视觉验证覆盖 27 个 UI 状态、375 / 768 / 1440 宽度、dawn / night 主题，共 350 张 PNG（含辅助时间轴截图），双审查 PASS。仅有日历 backlog 卡片的设计内水平滚动。

fixture evaluation 为 30/30，不能代表真实模型质量。真实模型为小样本：最终 capture 与 replan 均完成人工编辑、confirm、重复确认和读回；不能推导总体语义正确率或长期用户效果。原生 macOS 通知窗口、权限弹窗、完全退出后的后台投递、真实系统 Pinyin 候选窗口尚未验证；应用层 composition 测试不等于系统输入法实测。

## 7. 代码导航

| 领域 | 入口 |
| --- | --- |
| 任务字段与共享 schema | `src/shared/items.ts`、`src/shared/taskCore.ts` |
| 任务与版本写入 | `src/server/repositories/items.ts`、`itemMutations.ts`、`transaction.ts` |
| 重复系列 / 实例 | `taskSeries.ts`、`taskOccurrences.ts`、`recurrence*.ts` |
| 日历与冲突 | `src/server/services/calendar*.ts`、`routes/calendar.ts`、`src/client/pages/CalendarPage.tsx` |
| AI 规划 | `src/server/services/taskPlanning/`（capture / replan / plan 三种模式，含 `retrieval.ts`、`planProposal.ts`）、`routes/taskPlanning.ts`、`src/shared/taskPlanning.ts` |
| AI 质量门禁 | `src/server/evaluation/`（`npm run eval`，30 个合成 case，全部跑 plan 模式） |
| 备份与恢复 | `services/backup*.ts`、`db/migrations/011_task_time_core.sql` |
| 任务 UI | `TodosPage.tsx`、`TaskRow.tsx`、`TaskSubtasks.tsx`、`TaskSeriesDialog.tsx` |
| 规划 UI | `TaskPlanningPage.tsx`、`components/taskPlanning/`（含 `PlanProposalEditor.tsx`） |
| 验收测试 | `tests/e2e/task-time-acceptance.spec.ts`、`task-time-plan-mode.spec.ts`、`task-time-visual.spec.ts`、`tests/integration/task*.test.ts` |

## 8. 后续工作

M4/M5 尚未完成：跨设备同步与离线多端冲突、移动端技术方案、安装 / 升级 / 分发、连续两周以上真实用户效果，以及外部日历、MCP 和共享协作扩展。原生通知后台投递也需单独设计和实测。

下一位执行者先核对最终文档、`git diff --check`、工作树状态和残留进程。后续提交保持原有数据库和主检出可用，改动业务逻辑后跑 `npm test` 与 `npm run typecheck`。

### 推送与 CI 节奏

一次完整 CI（GitHub Actions，`npm ci` → lint → typecheck → test → build → eval → 两套 Playwright）约 9 分钟。**不要每提交一次就推送**——推送才触发 CI，频繁推送等于反复花这九分钟。

约定是：本地累积多个提交，一段改动收尾时**统一推送一次**，让 CI 覆盖全部累积内容。中间过程需要自检就跑本地命令（`npm test`、`npm run typecheck`、`npm run lint`，端到端则跑相关的单个 Playwright 文件），不触发 CI。

注意本地提交不等于远端有备份：未推送的提交只存在于本机。需要中途备份时推送即可，但不必等 CI 结果。
