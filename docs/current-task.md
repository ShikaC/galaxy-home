# 当前任务

更新日期：2026-09-16。

## 目标与状态

用户目标已更新为“类滴答清单 + AI 智能集成”的任务与时间管理应用。

本轮新版重构已完成阶段性交付。**首场景 4/4、视觉 350 张截图双复核、重启 3 周期、最终 lint/typecheck/build 和旧版 E2E 50/50 均通过。** 独立安全复核 75 项+7 项对抗复现、AI/日历复核 31 项通过；真实模型共 8 次请求，最后两次 v2 均完成确认、重试和读回核验。正式证据与限制见 [新版验证记录](task-time-validation.md)。

实施合约见 [任务与时间模型](task-time-model.md)。本地可执行计划位于 `.omo/plans/task-time-core.md`，Boulder 状态位于 `.omo/boulder.json`；这些本地工作文件被 Git 忽略，公开交接以本页与模型文档为准。

## 本轮环境与数据保护

- 实现已提交并合并到 `main`（`f1bb67c`，156 文件 / +16627 −1073）。当前工作位置为主检出 `/Users/shika/Documents/galaxy-home`，分支 `main`，工作树干净；`codex/task-time-core` 与 `main` 指向同一提交，worktree `/Users/shika/.codex/worktrees/galaxy-task-time-core/galaxy-home` 保留备用。上一版上游基线为 `4d438b0d2620c0d927a7d8a074485a01a5f85dd3`。
- 已核对 Node `v24.18.0`、npm `11.16.0`。工作树通过本地忽略的 node_modules 软链接复用主检出依赖，没有改动锁文件。
- 已只读核对主检出 `data/galaxy-home.sqlite` 和桌面 `~/Library/Application Support/app.galaxyhome.desktop/galaxy-home.sqlite`，两者均为 schema v8、31 张表，分别生成 SQLite backup API 副本。源数据库未迁移或写入。
- 副本位于本地忽略目录 `.omo/evidence/task-core/legacy-copies/`，分别为 `data-galaxy-home.sqlite`、`app.galaxyhome.desktop-galaxy-home.sqlite`；源库数据不同，不能把两个目录当成同一个空间。
- 数据迁移只在副本/合成库验证；两份副本已从 v8 升至 v11，各自 30 个旧业务表的旧字段一致，integrity_check=ok、外键违规 0。升级前快照、失败回滚、未来版本拒绝和 v1/v2 备份兼容已有定向回归，最终全仓复核仍待完成。

## 已决定的实现边界

- 保留 items UUID、多分类、项目关系、历史日期安排与旧 AI 运行记录；增量增加优先级、单层子任务、截止日期、预计耗时、一个连续安排时段、固定标记与版本。
- 重复系列独立；task_occurrences 是实例关系唯一权威，永久保留发生键和删除 tombstone，单次例外不被后续生成覆盖。
- 重复物化增加持久游标、每系列每批 366 日上限和 DST 错误隔离，逐批补齐离线历史；延期提醒增加持久 requestId，延迟重试/重启/恢复保持首次计算的时间。
- 多提醒使用规则数组；提醒时间变化使旧待触发记录失效，旧 reminderMinutes 保留兼容入口。平台投递通道已落地：应用内横幅与平台投递是两条独立通道（`delivered_at` / `platform_delivered_at`），桌面进程按 30 秒轮询领取后弹系统通知，窗口关闭只隐藏、进程驻留托盘，所以关窗后仍送达。完全退出后的定时投递仍需按平台各写原生代码并真机实测。
- 新版创建携带 requestId，可与 `today: { localDate, isFocus, isSecondary }` 原子保存；未知结果重试保持同一请求身份。更新和 AI 确认使用版本保护，409 保留用户草稿。保守模式录入只发送本次原文，读取真实日历重排需开放模式，确认时再次检查权限。
- 日历和 AI 共用真实安排与服务端容量校验。同步协议、移动端技术、账号及云供应商仍未选定。

## 已完成与下一步

核心 schema、011 迁移、items/版本/原子创建、重复服务、提醒与备份、手动 UI、日历和 AI 提案均已有实现与模块定向回归，并已随 `f1bb67c` 提交。跨模块风险审查、最终修正、全量类型/构建检查和实际 UI 场景已收口；模块日志的通过数有重叠，不能相加作为总测试数。

首场景已贯通：工作日反馈系列与周五方案 → 子任务 → 周日历安排 → 临时固定会议 → AI 重排预览/修改/确认 → 跨窗口冲突保留输入 → 刷新重启/重复实例/提醒。迁移副本、备份恢复、中文输入法、长文本、不同宽度和日夜主题均已完成对应证据。

仍未验收：托盘图标是否出现、关窗是否只隐藏、原生 OS 通知的实际显示与权限弹窗、完全退出后的定时投递、跨设备同步、移动端、安装升级和持续使用效果。平台投递的代码与联调证据见 `src-tauri/src/notifications.rs`（Rust 对真实生产模式服务端的领取、去重与拒绝无令牌均有测试）与 `tests/integration/notificationRoutes.test.ts`（双通道互不吞掉）。真实模型 8 次请求证明样例流程，不代表总体语义质量。

## 质量门禁现状

`main` 上已有首屏体积预算（`bundle-budget.json` + `scripts/check-bundle.mjs`，把 `dist/client/index.html` 真实引用的 JS/CSS 加起来比上限）与 axe 无障碍门禁（`tests/e2e/a11y.spec.ts`，两主题两视口，只跑 WCAG A/AA）。CI 见 `.github/workflows/ci.yml`：`verify` 跑 lint / typecheck / 测试 / 构建 / 体积 / 评测 / Playwright，`desktop` 编译并测试 `src-tauri` 的 Rust 代码。

## 当前入口

- [新版产品需求](product-requirements.md)：目标、优先级、产品语义、保留 / 重构范围、实施阶段与验收场景。
- [交接文档](handoff.md)：代码基线、模块入口、下一项工作、验证记录与接手提示词。
- [任务与时间模型](task-time-model.md)：本轮 M0 合约、设计理由、旧新数据映射与执行约束。
- [README](../README.md)：当前已实现能力、运行方式和数据目录。
- [DESIGN.md](../DESIGN.md)：当前设计基础及新版交互方向。

## 已有功能基线

本轮在上述工作树重新运行 `npm run typecheck` 通过；`npm test -- --maxWorkers=2` 通过 71 个文件、239 项测试，耗时 23.66 秒。证据保存在本地 `.omo/evidence/task-core/baseline.md`、`typecheck.log` 和 `baseline-tests.log`。这些是在新版功能集成前的接手验证，没有真实模型调用，不代表新版验收。

文档更新前基线为 `681a222`：真实模型体验后的异步规划、草稿编辑、版本冲突保护和评测改进已合并并推送。71 个测试文件 / 239 项单元与集成、50 项浏览器流程及 90 次固定评测通过，详见 [验收记录](agent-validation.md)。这些结果不代表新版任务、重复、日历与跨端功能已实现。

## 历史记录

旧“当前任务”已保存为 [2026-08-26 Windows 验收记录](archive/current-task-2026-08-26.md)。[旧说明书](项目说明书.md)、[旧 macOS 交接](macos-handoff-prompt.md) 和早期平台决策保留历史背景，其阶段性边界不覆盖新版需求。
