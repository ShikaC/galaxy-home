# Galaxy 新版产品重构交接

更新时间：2026-09-10。交接状态：**需求与交接文档已更新；新版任务 / 时间核心重构尚未开始。**

## 1. 接手目标与阅读顺序

用户希望做“类滴答清单 + AI 智能集成”的应用。后续在现有仓库重构，重建任务与时间核心，复用可靠的存储、迁移和 AI 执行机制。功能目标、优先级和首个验收场景统一维护在 [product-requirements.md](product-requirements.md)，本文只记录接手所需的状态、入口与操作顺序。

先读新版需求，再读 [README](../README.md) 的当前运行方式。设计任务读 [DESIGN.md](../DESIGN.md)；改 AI 工作流读 [agent-engineering.md](agent-engineering.md)；核对证据读 [agent-validation.md](agent-validation.md) 与 [live-model-usage.md](live-model-usage.md)。涉及平台启动时再读对应 Windows / macOS 历史材料。

## 2. 代码与环境快照

| 项目 | 交接时事实 |
| --- | --- |
| 仓库 | https://github.com/ShikaC/galaxy-home.git |
| 文档更新前功能基线 | `681a222957f19fd16ad8ade524a090ab503ad50e` |
| 当前工作分支 | `codex/agent-workspace`；接手时重新读取实际分支与工作区状态 |
| 本机主检出 | `/Users/shika/Documents/galaxy-home` |
| 本轮工作树 | `/Users/shika/.codex/worktrees/f1fa/galaxy-home` |
| Web / 服务端 | React 19、TypeScript、Vite；Fastify、SQLite、Zod；具体版本以 package 文件为准 |
| 桌面 | Tauri / Rust 壳拉起本机 Node；当前仍需要本机 Node 24+ |

路径是本次机器上的定位信息，其他机器从实际仓库根目录开始。这里记录固定的功能基线，而不是把移动的 HEAD 当作验收版本；文档提交可能位于该基线之后。

与本轮接手最相关的已合并提交：

- `0a187ce`：AI 系统代理连接与服务根地址兼容。
- `e75deec`：可恢复查询的异步规划、取消保护、草稿版本与关闭顺序。
- `af83f00`：追问回答、确认前编辑、引用展开、旧版本冲突保护及 UI 验证。
- `681a222`：真实模型体验记录、硬性检查与质量提示分离。

接手前运行 `git status --short --branch`、`git log -5 --oneline`，再核对远程。使用 `codex/` 前缀的独立分支推进实施，保留主分支可运行；用户已有改动、stash 和其他工作树需分别识别并保留。合并和推送沿用当前任务中的用户授权，使用正常提交与可检查的合并。

## 3. 已经做实的能力与限制

现有任务、分类、项目、笔记、习惯、回顾、备份与回收站均有实际业务数据路径。AI 计划支持追问、草稿编辑、确认、事务执行与核验、重复请求去重、版本冲突、刷新查询和取消。

需要精确理解：

- AI 计划的预算仅针对本次提案，尚未扣除全天已有安排。
- 已安排并核验代表数据库写入正确，不代表用户已完成任务。
- 规划接口可返回 202，后台生成继续执行；运行记录持久化不等于跨进程自动续跑。意外重启后遗留生成恢复为失败，需重试。
- 取消可阻止接受迟到结果与写入任务，未保证中断服务商 HTTP 请求或停止计费。
- 词面检索与引用 ID 校验已有；语义召回、引用是否支持结论及复杂重排仍需验证。
- 响应式页面已有；账号、跨设备同步与移动端独立交付尚未实现。
- 当前 `secrets.json` 在本机以受限文件权限保存，业务备份排除密钥；尚未接入系统凭据库。

## 4. 代码导航

下列链接相对于仓库，接手时核实当前实现；这是定位入口，不要求保留现有模块边界。

| 工作内容 | 入口 |
| --- | --- |
| 任务字段与验证 | [src/shared/items.ts](../src/shared/items.ts) |
| 任务、分类与今日关联 | [items.ts](../src/server/repositories/items.ts)、[todayItems.ts](../src/server/repositories/todayItems.ts)、[categories.ts](../src/server/repositories/categories.ts) |
| 数据库迁移与恢复 | [db/migrations](../db/migrations)、[database.ts](../src/server/database.ts)、[backup.ts](../src/server/services/backup.ts) |
| 时区与提醒 | [time.ts](../src/server/services/time.ts)、[scheduler.ts](../src/server/services/scheduler.ts)、[desktopNotify.ts](../src/client/lib/desktopNotify.ts) |
| 手动记录与任务 UI | [capture.ts](../src/client/lib/capture.ts)、[TodosPage.tsx](../src/client/pages/TodosPage.tsx)、[TaskRow.tsx](../src/client/components/TaskRow.tsx) |
| 工作空间结构与组件 | [AppShell.tsx](../src/client/components/AppShell.tsx)、[ui](../src/client/components/ui)、[tokens.css](../src/client/styles/tokens.css) |
| 规划模型、接口与执行 | [planning.ts](../src/shared/planning.ts)、[routes/planning.ts](../src/server/routes/planning.ts)、[services/planning](../src/server/services/planning) |
| AI 上下文、操作和连接 | [aiContext.ts](../src/server/services/aiContext.ts)、[aiChatActions.ts](../src/server/services/aiChatActions.ts)、[ai.ts](../src/server/services/ai.ts)、[aiProxy.ts](../src/server/services/aiProxy.ts) |
| 评测 | [evaluation](../src/server/evaluation)、[evaluationGraders.test.ts](../tests/unit/evaluationGraders.test.ts) |
| 规划回归 | [planning.test.ts](../tests/integration/planning.test.ts)、[planningEditing.test.ts](../tests/integration/planningEditing.test.ts)、[planDraftConflict.test.tsx](../tests/client/planDraftConflict.test.tsx)、[planning.spec.ts](../tests/e2e/planning.spec.ts) |
| 桌面生命周期 | [src-tauri/src](../src-tauri/src)、[桌面历史验收](windows-desktop-acceptance.md) |

## 5. 下一位执行者的第一项工作

从需求中的 M0 开始，完成任务 / 时间 / 重复模型及旧数据迁移设计，然后进入 M1。需要得到可审查的设计结果，而不是直接替换所有页面。

1. 读取任务、日期关联、项目、提醒及备份实现，列出现有字段、关系与实际不变量。完成标志：每种现有数据都有去向，不能只列新表。
2. 用需求第 5 节场景验证任务、子任务、重复系列 / 实例、截止时间、安排时段和固定事件的语义。完成标志：正常、例外和冲突场景都能明确表达。
3. 制定增量迁移、导入兼容、失败恢复与回退方案。完成标志：旧任务 / 多分类 / 今日安排 / 历史 AI 运行都有映射，迁移前后可核对。
4. 确定第一个可运行改动及必要回归，记录在当前任务中。完成标志：可以独立演示手动任务路径，并为随后重复、提醒、日历扩展提供稳定接口。

同步的身份、版本和删除语义在此阶段一并考虑；完整同步服务后续实施。不要仅更换主题就宣称重构完成。旧测试中关于数据安全的保障继续保留；仅服务旧产品规则的断言，应随明确的新行为与迁移测试更新。

## 6. 验证基线与复现注意

以下是 `681a222` 功能基线的历史结果，本次文档更新不重新运行全套程序测试，也不将历史结果计为新版验收：

| 检查 | 最近记录 |
| --- | --- |
| 单元 / 集成 | 71 文件，239 项通过；本机 `npm test -- --maxWorkers=2` |
| 浏览器 | 50 项通过；含不同视口下的核心页面与流程 |
| 确定性评测 | 30 场景 × 3 次，90/90 |
| 静态 / 构建 | 类型检查、lint、生产构建通过；lint 有 20 个提示级建议 |
| 规划视觉 | 12 状态、3 宽度、2 主题及滚动位置，150 截图；两项独立复核通过 |
| 真实模型 | 15 个自动化试次；另有 4 次完成规划、1 次取消和一次笔记提炼交互 |

固定模型回归只证明已覆盖的流程约束。15 个真实试次通过适用硬性检查，不能推导总体语义正确率。评测 v2 保留关键词质量提示，不能把新旧口径差异宣传为模型提升。

[功能基线主分支 CI](https://github.com/ShikaC/galaxy-home/actions/runs/34466414632) 已通过，对应 `681a222`；接手时重新查询后续提交的状态。测试与运行命令以 [package.json](../package.json)、[Playwright 配置](../playwright.config.ts) 和 [CI](../.github/workflows/ci.yml) 为准。

- 本机资源有限时限制 Vitest 并发；上次全量默认并发出现资源争用，限制到 2 后通过，没有修改单元测试断言或超时。
- E2E 独占测试服务器；执行期间保持相关源文件稳定，避免开发服务器重启污染结果。
- 主题截图要调用应用主题路径或同时设置 `data-theme` 与根节点 `style.colorScheme`，否则原生日期控件会出现假问题。
- 真实模型验证使用独立合成数据空间，记录调用量和样本；凭据、个人数据库及原始私密内容不进入仓库或日志。
- 修改对应功能后运行针对性测试，最终执行受影响的完整验证；UI 与桌面改动需实际操作，平台历史证据不相互替代。

## 7. 运行数据与本地证据

常规数据目录与启动方式见 README。浏览器开发目录和桌面 Application Support 目录可能不同，先确认实际 `GALAXY_DATA_DIR`，再判断是否丢数据；在备份副本中做迁移验证。

本次会话曾使用以下临时服务；端口、进程和目录可能已变化，先检查存活与所有权：

- 原预览：`http://127.0.0.1:52595`，启动信息保存在本机 `/tmp/galaxy-agent-preview.json`。
- 独立真实模型体验空间：`http://127.0.0.1:52601`。其模拟数据与脚本在 `.omo/evidence/live-usage/`，不属于用户的正式数据。
- 真实调整后计划 ID：`cf2c86de-ca19-4d41-8f8a-a327d60135f5`，可在独立空间中查看 2 项复用、2 项新建和编辑版本结果。

`.omo/evidence/live-usage/` 是本机忽略目录，新克隆通常没有。缺少本地证据时，以提交内的验收说明、CI 与重新运行结果为依据；不要声称已读取不存在的文件。停止临时进程前先确认所属任务，避免影响用户正在使用的预览。

## 8. 可直接粘贴给下一位执行者

> 请接手 Galaxy 的新版产品重构。先阅读 `docs/product-requirements.md` 和 `docs/handoff.md`，核对当前 Git 与运行环境。目标是以任务和时间管理为中心的“类滴答清单 + AI”产品，在现有仓库重建核心，复用可靠的数据与 AI 执行机制。新版尚未开始实现，请从 M0 的任务 / 时间 / 重复语义和旧数据迁移方案开始，再实施 M1。优先跑通需求中的首个完整场景，记录每步真实证据。历史文档仅供理解旧实现；新需求优先。区分现有能力、建议方案、已完成改动和未验证事项。完成交接时更新 `docs/current-task.md`，报告具体改动、验证结果、剩余工作与 Git 状态。
