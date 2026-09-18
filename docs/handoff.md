# Galaxy 新版产品重构交接

更新时间：2026-09-17。交接状态：**M0–M3 已完成，首个任务 / 时间 / AI 重排完整场景已验证；质量门禁（首屏体积预算、axe 无障碍、Rust CI）与桌面平台投递通道已落地并推送。「知识计划」已并入 AI 任务规划（plan 模式），旧 `/plans` 入口与 `services/planning/` 已退役。**

## 1. 接手顺序与目标

先阅读 [product-requirements.md](product-requirements.md)、本文、[current-task.md](current-task.md)、[README](../README.md) 和 [DESIGN.md](../DESIGN.md)。修改 AI 工作流前阅读 [agent-engineering.md](agent-engineering.md)；核验结果阅读 [task-time-validation.md](task-time-validation.md)、[agent-validation.md](agent-validation.md) 和 [live-model-usage.md](live-model-usage.md)。第 9 节是一份可直接粘贴给下一位执行者的提示词，不用自己重新归纳上下文。

产品目标是以任务和时间管理为中心的“类滴答清单 + AI”应用：AI 参与记录、整理、安排、执行、重排和回顾。新版实现优先保证任务语义、安排时段、重复实例、提醒、容量约束、可审查提案和旧数据兼容。

## 2. 当前代码与运行环境

| 项目 | 当前事实 |
| --- | --- |
| 仓库 | https://github.com/ShikaC/galaxy-home.git |
| 主检出 | `/Users/shika/Documents/galaxy-home`，分支 `main`，当前工作位置 |
| 实施工作树 | `/Users/shika/.codex/worktrees/galaxy-task-time-core/galaxy-home`（保留备用，与 `main` 同提交） |
| 分支 | `main`；`codex/task-time-core` 已合并，指向同一提交 |
| 接手基线 | `34e7fcc`（`文档改成按「进程存活」与「完全退出」两条边界描述提醒`），已推送，工作树干净 |
| 上一版上游基线 | `4d438b0d2620c0d927a7d8a074485a01a5f85dd3` |
| 质量门禁基线 | `ae0e934` 起：体积预算、axe 无障碍、Rust CI job；自 `52a5717` 起共 17 个提交 |
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

### 2026-09-17 在 `34e7fcc` 的完整复核

| 门禁 | 结果 |
| --- | --- |
| `npm run lint` | 405 files，0 error / 0 warning |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过 |
| `npm run check:bundle` | 首屏 JS 157.7 KB / CSS 16.9 KB，41 个请求，最大 eager chunk 72.1 KB |
| `npm test` | **99 files / 390 tests PASS** |
| `npm run test:e2e` | 64/64（含 6 项 axe 无障碍） |
| `npm run test:e2e:task-core` | 10/10 |
| `cargo test`（`src-tauri`） | 18 passed + 1 ignored（真机联调用例） |
| `npx react-doctor` | 79 warnings / 0 error，67 分 |
| GitHub Actions | `verify` ✓ 451s，`desktop` ✓ 154s |

2026-09-16 的旧记录（`f1bb67c`：102 files / 395 tests、lint 2 warnings + 103 infos、E2E 50 项、350 张 PNG 视觉验证）保留在历史里；上面的数字更新，差异来自本轮清理与门禁改动，不是回归。

视觉验证覆盖 27 个 UI 状态、375 / 768 / 1440 宽度、dawn / night 主题，共 350 张 PNG（含辅助时间轴截图），双审查 PASS。仅有日历 backlog 卡片的设计内水平滚动。本轮改了配色 token（见下），截图已按新配色重新生成，但**没有**逐张重看。

fixture evaluation 为 30/30，不能代表真实模型质量。真实模型为小样本：最终 capture 与 replan 均完成人工编辑、confirm、重复确认和读回；不能推导总体语义正确率或长期用户效果。原生 macOS 通知窗口、权限弹窗、真实系统 Pinyin 候选窗口尚未验证；应用层 composition 测试不等于系统输入法实测。平台投递通道已有代码与联调证据（Rust 侧对真实生产模式服务端的领取、去重、拒绝无令牌都在测试里跑过，见 `src-tauri/src/notifications.rs` 的 `#[ignore]` 用例），但托盘图标是否出现、关窗是否只隐藏、系统通知是否真的弹出来，都还没在真机上看过。

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

M4/M5 尚未完成：跨设备同步与离线多端冲突、移动端技术方案、安装 / 升级 / 分发、连续两周以上真实用户效果，以及外部日历、MCP 和共享协作扩展。

提醒方面还剩两件事，性质不同：

1. **真机验收托盘与通知**（低成本，应先做）。代码与联调证据都在，但托盘图标是否出现、关窗是否只隐藏、系统通知是否真的弹出，没有在图形界面里看过。把这三件事看一遍就能把「已实现」升级成「已验收」。
2. **完全退出后的定时投递**（高成本）。`tauri-plugin-notification` 桌面端接受 `Schedule` 但不消费它，需要在 macOS 的 `UNUserNotificationCenter` 与 Windows 的 `ScheduledToastNotification` 上各写一份原生代码，并且必须在对应平台真机实测——在 macOS 上无法验证 Windows 侧。

其它已识别但未开工的缺口：安装包签名 / 公证 / 自动更新（桌面分发的硬门槛）；AI 限流、token 预算与真实模型回归集；跨设备同步（审计里得分最低，建议先写语义文档再写代码：哪些状态同步、冲突怎么解、离线多久算过期、tombstone 保留多久）。

下一位执行者先核对最终文档、`git diff --check`、工作树状态和残留进程。后续提交保持原有数据库和主检出可用，改动业务逻辑后跑 `npm test` 与 `npm run typecheck`。

### 推送与 CI 节奏

一次完整 CI（GitHub Actions，`npm ci` → lint → typecheck → test → build → eval → 两套 Playwright）约 9 分钟。**不要每提交一次就推送**——推送才触发 CI，频繁推送等于反复花这九分钟。

约定是：本地累积多个提交，一段改动收尾时**统一推送一次**，让 CI 覆盖全部累积内容。中间过程需要自检就跑本地命令（`npm test`、`npm run typecheck`、`npm run lint`，端到端则跑相关的单个 Playwright 文件），不触发 CI。

注意本地提交不等于远端有备份：未推送的提交只存在于本机。需要中途备份时推送即可，但不必等 CI 结果。

## 9. 接手提示词

以下整段可直接粘贴给下一位执行者（人或模型），开头不需要额外交代上下文。

````text
你是接手「银河居所」（Galaxy）的下一轮执行者。这是一个本地优先的任务 / 时间 / AI 助手：
React 19 + Vite + Fastify + SQLite(zod 4) + Tauri 桌面壳，界面中文，服务端只监听 127.0.0.1。
仓库 /Users/shika/Documents/galaxy-home，分支 main。

动手前先做三件事。

一、按顺序读文档
  docs/handoff.md（第 2、3、6、7、8 节最关键，第 6 节是诚实的验证边界）
  → docs/current-task.md → docs/product-requirements.md → README.md → DESIGN.md
  改 AI 工作流前加读 docs/agent-engineering.md。
  注意：docs/current-task.md 里的基线提交号已经过时（写着 f1bb67c），
  以 handoff 第 2 节的接手基线为准。

二、核对环境，不要相信文档里的数字
  git status --short --branch && git log -5 --oneline
  HEAD 应为 34e7fcc 或其后，工作树干净。

三、自己跑一遍门禁，确认基线是绿的
  npm run lint && npm run typecheck && npm test        # 期望 405 文件 0/0；390 测试
  npm run check:bundle                                  # 首屏体积预算
  cd src-tauri && cargo +stable test && cd ..           # 18 passed + 1 ignored

── 会咬你的坑 ──────────────────────────────────────────

1. Rust 必须用 `cargo +stable`，不能直接用 `cargo`。
   本机环境变量 RUSTUP_TOOLCHAIN=1.83.0 覆盖了 src-tauri/rust-toolchain.toml，
   默认 cargo 是 1.83，会在依赖上报 "feature edition2024 is required"。
   `cargo +stable` 是 1.98.1。CI 没有这个环境变量，走 rust-toolchain.toml，不受影响。

2. 不要每提交一次就推送。CI 一次约 10 分钟（verify 451s + desktop 154s）。
   本地累积多个提交，一段改动收尾时统一推一次。中途自检跑本地命令。
   未推送的提交只存在于本机，没有远端备份。

3. E2E 断言的是精确文案（例如首页标题匹配 /上午好|下午好|晚上好|夜深了/）。
   改 UI 文案会打断测试；要改文案就连测试一起改，并在提交信息里说明。

4. 改颜色 token 前先想清楚：axe 无障碍门禁要求正文在它出现的每一层底色上达到
   WCAG AA 4.5:1。浅色主题的「两级安静文字」因此只剩一层（muted 与 faint 的
   层级差从 ΔL* 8.4 压到 2.0），DESIGN.md 里写明了这个约束。
   改完跑 `npm run test:e2e -- tests/e2e/a11y.spec.ts`，不要靠肉眼判断。

5. axe 和 biome 在滚动容器上要求相反：axe 的 scrollable-region-focusable 要求可聚焦，
   biome 的 noNoninteractiveTabindex 禁止非交互元素带 tabindex。项目里按 axe 处理
  （WCAG 是硬约束），用单行 `// biome-ignore lint/a11y/noNoninteractiveTabindex: 理由`
   标注，完整解释写在该 JSX 上方。参考 CalendarTimeline.tsx。

6. 提交信息用中文，不带 conventional-commit 前缀。信息里若含反引号或 $，
   用 heredoc 写进临时文件再 `git commit -F`，别用双引号内联（$ 会被 shell 展开）。

7. 手动联调服务端时注意：GALAXY_PARENT_LIFETIME=1 会让服务端盯住 stdin，
   stdin 一结束就自己关掉。想让它活着，用 `sleep 600 | node dist/server/index.js`。

── 现状（已经做完，不要重新发现）──────────────────────

- 任务 / 时间核心、重复系列与实例、日历与冲突、AI 任务规划（capture/replan/plan 三模式）、
  备份恢复、回收站、笔记习惯回顾都已实现并有测试。
- 质量门禁已上锁：首屏体积预算（bundle-budget.json + scripts/check-bundle.mjs）、
  axe 无障碍（tests/e2e/a11y.spec.ts，两主题两视口，只跑 WCAG A/AA）、
  CI 里新增的 desktop job（编译并测试 src-tauri）。
- 提醒的平台投递通道已落地：服务端把「应用内横幅」和「平台投递」记成两条独立通道
  （notification_events.delivered_at / platform_delivered_at）；桌面进程每 30 秒领取一批
  弹系统通知，窗口关闭只隐藏，进程驻留托盘，所以关窗后仍能收到提醒。
  托盘菜单的「退出」是唯一真正的退出入口。

── 仍未验收，不要声称已验收 ──────────────────────────

- 托盘图标是否出现、关窗是否只隐藏、系统通知是否真的弹出。
  代码和联调证据都在（src-tauri/src/notifications.rs 的 #[ignore] 用例跑过真实
  生产模式服务端：首次领取 2 条、第二次 0 条、无令牌与错令牌都被拒），
  但没有在图形界面里看过。
- 完全退出后的定时投递。tauri-plugin-notification 在桌面端接受 Schedule 但不消费它
  （show() 只读 title/body/icon/sound），需要在 macOS 的 UNUserNotificationCenter 与
  Windows 的 ScheduledToastNotification 上各写一份原生代码，且必须真机实测。
- 真实模型的总体语义质量（只有 8 次请求的样例，不代表正确率）。
- 跨设备同步、移动端、安装升级与持续使用效果。

── 建议的下一步（按性价比排序）───────────────────────

1. 真机验收托盘与通知。跑 `npm run desktop`（桌面开发模式，端口 5180/3010），
   看托盘图标、关窗行为、通知是否真的弹出。这是把「已实现」升级成「已验收」的
   唯一动作，成本最低。做完更新 docs/handoff.md 第 6 节与 docs/current-task.md。
2. 完全退出后的定时投递。成本高，且 Windows 侧必须在 Windows 主机上测。
3. 跨设备同步。审计里得分最低的缺口（30/100）。建议先写语义文档再写代码：
   哪些状态同步、冲突怎么解（LWW 还是合并）、离线多久算过期、tombstone 保留多久。
   项目里已有持久 requestId 与 tombstones，是现成的基础。
4. 安装包签名 / 公证 / 自动更新（桌面分发的硬门槛）；AI 限流与 token 预算。

做完一轮后更新 docs/current-task.md 与本文档，然后统一推送一次。
````
