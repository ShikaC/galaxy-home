# 新版任务与时间核心：阶段验证记录

更新：2026-09-12。状态：**M1–M3 首场景及最终检查完成；M4/M5 和平台边界仍待验收。** 本页只记录本轮实际证据，不使用历史结果替代新版验证。需求见 [product-requirements.md](product-requirements.md)，合约见 [task-time-model.md](task-time-model.md)，下一步见 [current-task.md](current-task.md)。

## 验证对象与证据范围

工作树 `/Users/shika/.codex/worktrees/galaxy-task-time-core/galaxy-home`，分支 `codex/task-time-core`，接手提交 `4d438b0d2620c0d927a7d8a074485a01a5f85dd3`。以下模块证据来自本轮未提交实现；最终提交和最终全仓结果待主执行者补录。运行环境 Node v24.18.0、npm 11.16.0。

详细日志和合成数据位于本机忽略目录 `.omo/evidence/task-core/`，不会随克隆下载。本页保存可跟随 Git 的结果摘要与复现入口；日志文件名只用于本机追查。多个模块包含相同集成测试，表中数量不能相加成全仓总数。

| 检查 | 已观察结果 | 证据与限制 |
| --- | --- | --- |
| 接手类型检查 | `npm run typecheck` 通过 | `typecheck.log`；新版集成前基线。 |
| 接手单元/集成 | `npm test -- --maxWorkers=2`：71 文件、239 项通过，23.66 秒 | `baseline-tests.log`；不是新版验收。 |
| 核心 schema/items/API/版本 | 定向测试覆盖原子创建、请求重放/冲突、父子约束、关系回滚、today 去重与旧上限移除 | `core.md`、`final-core-tests.log`、`review-regressions-green.log`；全仓结果待汇总。 |
| 重复规则与实例 | 4 文件、19 项通过 | `recurrence-focused.log`；日/周/月、DST、默认多提醒、重启幂等、跳过及永久删除 tombstone、单次例外。 |
| 日历与容量 | 3 文件、20 项通过 | `calendar.md`；半开区间、跨日、工作时段、固定/已完成占用、版本与手动安排事务、草稿保留。 |
| 提醒/备份/恢复 | 11 文件、56 项通过 | `data-safety-targeted.log`；平台通知边界使用 mock，不代表 OS 实际显示。 |
| 新任务 AI 服务 | 1 文件、11 项通过 | `task-ai-vitest.log`；真实 SQLite/业务服务，外部模型为固定 provider。 |
| 新任务 AI 编辑器 | 3 文件、10 项通过 | `task-ai-ui-client.log`；IME、原文、请求身份、刷新草稿、409 和日期转换，尚不是浏览器整体验收。 |
| 独立数据安全复核 | 11 文件、75 项通过；独立对抗复现 7 项通过 | `review-data-safety.md`、`review-safety-final-tests.log`、`review-safety-repro-final.log`；涵盖事务/身份/重复/提醒/恢复边界。 |
| 独立 AI/日历复核 | 3 文件、26 项通过 | `review-ai-calendar.md`；最终状态重叠、遗漏工作、逐项及截止前缀容量、权限与提案保护。 |
| 新一轮 typecheck/build | 主执行者已确认通过 | `final-typecheck.log` 及主执行者构建结果；不等于浏览器验证。 |
| 最终 lint | 401 文件通过（39 warnings / 98 infos） | `final-lint.log`；提示不阻断。 |
| 最终 typecheck/build | 通过；build 3026 modules | `final-typecheck.log`。 |
| 旧版 E2E | 50/50 通过 | 最终冻结代码重跑。 |
| 固定评测 | 30/30 通过 | `final-eval.log`。 |
| 完整场景 | 4/4 通过；重启 3 周期通过 | `scenario` 证据。 |
| 视觉复核 | 29 sheets / 350 PNG / 27 states，设计与 CJK 双 PASS | `visual-review-*-final.md`。 |
| 真实模型 | 8 次请求；v2 007/008 均确认、重试、读回通过 | `live-task-planning-final.*`；样本不代表总体质量。 |
| 完整浏览器场景与视觉操作 | 待完成 | 尚无本轮完整场景通过声明。 |
| 新版真实模型评测 | 待完成 | 固定 provider 不能代替语义质量。 |
| 持续使用 / 跨设备 / 安装升级 | 未执行 | M4/M5 独立验收。 |

模块复现入口：

```sh
npx vitest run tests/unit/recurrence.test.ts tests/integration/recurrence.test.ts tests/integration/recurrenceLifecycle.test.ts tests/integration/recurrenceApi.test.ts
npx vitest run tests/client/calendar.test.tsx tests/unit/calendar.test.ts tests/integration/calendar.test.ts
npx vitest run tests/integration/taskPlanning.test.ts
npx vitest run tests/integration/taskReminders.test.ts tests/integration/taskBackup.test.ts tests/integration/taskBackupRecovery.test.ts tests/integration/backup.test.ts tests/integration/database.test.ts tests/integration/scheduler.test.ts tests/integration/schedulerTimezone.test.ts tests/integration/planningRecovery.test.ts tests/integration/notes.test.ts tests/client/desktopNotify.test.ts tests/client/reminderBanner.test.tsx
```

## 旧数据副本升级

先以 readOnly 打开用户源库，通过 SQLite backup API 生成副本；再从副本生成 UUID staging 工作库和升级前快照，只迁移 staging。用户主检出数据和桌面数据均未迁移，已有预览服务未被停止。

| 副本来源 | 升级 | 旧业务数据核对 | SQLite 检查 |
| --- | --- | --- | --- |
| 主检出 `data/galaxy-home.sqlite` | v8 → v11 | 30 个旧业务表、67 行，旧字段按 rowid 排序后的 SHA256 一致；7 个任务与 7 条日期关系保留 | 升级前后 integrity_check=ok，外键违规 0。 |
| 桌面 Application Support 数据库 | v8 → v11 | 30 个旧业务表、53 行，旧字段同样一致；2 个任务与 1 条日期关系保留 | 升级前后 integrity_check=ok，外键违规 0。 |

证据：`legacy-upgrade-report.json`、`legacy-upgrade.log`，复核脚本 `verify-legacy-upgrade.mjs`。30 个业务表不包含 schema_migrations；源库最初清点的 31 张表包含该表。

两份真实副本没有旧任务截止提醒，多分类关系和 AI 历史中的部分表也是空样本。该项结果只证明实际存在的数据保留，不扩大为这些空表内容迁移的真实样本证明。旧任务提醒由合成 v8/v1 ZIP 用例覆盖；多关系、新旧规划记录与恢复保护由定向备份及集成用例验证。

v2 ZIP 包含新系列、实例、提醒规则、任务提案与创建请求绑定；兼容缺新表/新列的 v1 包。恢复在事务内检查外键/父子/规则/时间字段，关联触发器运行后恢复归档版本；失败回滚原库。未结束的新任务 AI 运行在恢复时取消并记录 RESTORED_WORKSPACE；已成功结果及创建请求身份保留。业务导出排除 secrets。

## 首场景验收（已完成）

以下 7 项均已通过场景与视觉证据验证：

- 原文“每个工作日检查客户反馈，周五提交方案”识别为系列和日期截止任务；用户修改预览后确认。
- 添加子任务、预计耗时和多提醒，周日历安排；列表/详情/今日/日历读同一状态。
- 临时固定会议引发冲突；AI 保护固定、已完成及锁定任务，无法排下时明确反馈。
- 展示修改前后、理由和冲突；编辑提案后跨窗口改变相关数据，旧确认 409，未保存输入保留。
- 原子执行并读回核验；重复创建/确认/重试/生成实例保持业务身份。
- 刷新与重启保留数据，后续实例和提醒正确；失败、取消和断网仍可完成手动路径。
- 实际 UI 操作覆盖长中文、键盘和输入法、窄/中/宽视口、日间/夜间主题。

## 仍待独立验收的边界

子任务只有一层，父子完成相互独立；有未完成子任务时父任务完成被拒绝。父编辑器内子任务创建/保存立即生效，取消只丢弃父草稿，界面已有说明。当前编辑器自身的子操作成功推进预期版本，外部并发仍产生冲突。旧多分类与项目关系保留。

系列模板改变只影响尚未物化的实例，已生成实例和单次例外不被覆盖；月末没有该日时跳过，工作日仅周一至周五。新增持久化游标逐批补齐长期离线历史并推进到当前日后 42 天，每系列每批最多 366 日。DST 失败用系列级 savepoint 回滚该批、保留原游标并记录结构化错误，其他系列继续。错误由系列 GET API 返回，尚无专门恢复 UI；可 PATCH 修正时区/时刻/规则后等待自动重试，成功自动清除错误。显式范围物化不修改自动游标及错误，暂停只停止重试。

创建通过 requestId 与规范化输入绑定，创建和 today 关联可原子写入；未知结果重试保持同一身份。任务与 AI 草稿冲突由服务端版本校验，编辑器保留本地输入；AI 未保存草稿的 sessionStorage 只承诺当前标签页刷新恢复，关闭标签页后不承诺保留。

保守模式的 AI 录入只发送本次原文；重排读取真实安排需要开放模式，确认时再次检查。任务 AI 的捕获和重排均需确认，不沿用旧聊天“开放模式立即操作”的界面语义。

提醒覆盖应用运行和恢复补显；桌面通知调用成功不代表 OS 显示成功，不承诺跨进程、跨窗口或崩溃时恰好一次投递。退出后的平台定时通知、实际 OS 权限与安装交付未验收。新版延期已增加持久 requestId 与事件/时长绑定，原子更新请求/事件/提醒；延迟重试、重启及备份恢复保持首次绝对提醒时间，异输入重用返回 409，独立安全复核已覆盖。

AI 校验计算提案执行后的最终状态，保留未解决重叠并移除已解决重叠；本次范围内遗漏的已知耗时工作明确返回 UNSCHEDULED_WORK，逐项连续时段及截止时间前缀总容量检查补充不可行原因。该能力不是最优调度求解器。

M4 的账号、同步协议、移动技术与供应商尚未选定；M5 连续使用及实际用户效果未执行。最终全仓计数、浏览器证据和真实模型结果必须在各自完成后更新本页，不能由历史通过数或计划推断。
