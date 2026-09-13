# M0：任务、时间与迁移实施合约

日期：2026-09-10。M0 已完成，M1–M3 代码进入独立审查和集成验证；本文记录实际实现合约，不是完成验收报告。需求依据为 [product-requirements.md](product-requirements.md)，当前证据见 [task-time-validation.md](task-time-validation.md)。本地执行计划位于忽略目录 `.omo/plans/task-time-core.md`；接口调整与限制在本文保留。

## 1. 采用增量任务模型

保留 `items` 作为唯一任务实体，列表、详情、今日、项目和日历读取同一 UUID。旧项目、笔记、习惯、AI 历史均保留。依据：`item_categories`、`item_projects`、`today_items`、提醒及 AI 执行均已引用 items，换表会扩大迁移风险。

| 字段 | 合约 |
| --- | --- |
| `version` | 正整数，初始 1；可影响任务或安排的业务更新递增。用于并发保护，不替代时间戳。 |
| `priority` | `none / low / medium / high`，默认 `none`。 |
| `parentId` | 可空任务 UUID，首阶段仅一层父子。拒绝自身、循环、孙任务、已删除父项；已有孩子的任务不能再变成子项，父子必须是真实任务，项目关系独立。 |
| `dueAt` | 兼容旧字段，带偏移的时间点，持久化为 UTC；不推导开始时间。 |
| `dueDate` | 可空 `YYYY-MM-DD`，与 dueAt 互斥，表示日期截止，不转 UTC 零点。 |
| `estimatedMinutes` | 可空正整数，建议范围 1–1440；未知不自动当作零分钟。 |
| `scheduledStartAt / scheduledEndAt` | 同时为空或同时存在，UTC 时间点，结束严格晚于开始；首阶段一任务一个连续时段。 |
| `scheduleTimezone` | 安排时使用的 IANA 时区；有时段时必填，保留用户输入上下文。 |
| `isFixed` | 默认 false；true 表示用户固定时段，AI 不能移动。手动编辑允许，但需版本匹配。 |
| `recurrenceSeriesId / recurrenceDate` | API 可空字段，由 task_occurrences join 读取；items 不重复保存系列关系。标识重复系列及名义发生日期，身份不因单次时段调整变化。 |

SQL 使用 snake_case，JSON 使用 camelCase。沿用 `status=active/completed/archived`、`completedAt`、`deleted_at` 及原有内容/关系字段；软删除保留身份和历史。固定会议使用带固定时段的任务表达，UI 显示“固定日程”；后续外部日历独立适配。

分类保留现有多对多关系及排序，首阶段继续显示“分类”，不武断选一项变成唯一清单。项目归属照旧。父子完成彼此独立：完成父任务前若仍有未完成子任务，返回可理解的冲突；不会悄悄批量完成孩子。恢复父任务不会重开已完成孩子。子任务继承分类是创建时的显式默认值，之后可独立编辑。

全天安排继续存 `today_items(local_date,item_id)`，同一任务可以保留多个历史日期。旧日期计划迁移原样保留；新日历移动时段只调整受操作的安排，历史记录不批量重写。今日查询合并本地日期关联及覆盖该日的时段，按任务 ID 去重；日期截止单独显示，不能假装成安排。

旧“主要最多 3 项”不再约束今日任务总数。重点唯一可作为可选聚焦功能保留；主要/稍后标记和排序不丢失。容量依据时间区间计算。

## 2. 时间、约束与日历

日期用严格日历验证；时间点必须有时区偏移。用户在本地日期/时钟和 IANA 时区间转换；夏令时不存在或重叠时间需要显式反馈/选择，不能默默改变输入。日/月递增使用日历运算，不用固定 24 小时毫秒。

日历范围采用 `[startDate,endDate)`，时段采用 `[startAt,endAt)`；前一个结束等于后一个开始不冲突。跨日任务按各日交集计算。截止日期以指定工作空间时区该日结束解释容量，显示仍保留日期。变更工作空间时区不修改已保存日期或时间点。

工作时段以请求中的明确设置为准，初始 UI 可填工作日 09:00–18:00，但需可修改并展示。固定事件、已安排任务及本次提案共同扣除容量。未知耗时要求用户补充或列为未解决，不能悄悄排入。任务超过截止、时段重叠、工作时段外和无法排下均返回结构化冲突；禁止 AI 确认带阻断冲突的提案。

`GET /api/calendar?startDate&endDate&timezone` 返回真实任务、日期安排、固定时段及可用区间，可携带 JSON 编码 workWindow。`POST /api/calendar/validate` 接收候选时段与工作时段并返回验证结果；`POST /api/calendar/schedule` 将单项手动校验与版本写入放在同一事务。创建会议可以产生与现有可移动任务的冲突，UI 明确展示；随后重排解决冲突，不能通过吞掉原安排解决。日历 workWindow.weekday 使用 JavaScript 0–6（周日为 0），重复规则 weekdays 使用 ISO 1–7，两者由边界转换保持语义一致。

## 3. 重复系列与实例

新增 `task_series` 保存版本、模板标题/说明/优先级、`categoryIds/projectIds`、时区、开始日期、规则、`estimatedMinutes`、`dueTime`（本地 HH:mm 或 null）、默认 `reminders` 数组和启停状态。默认 reminders 与 Item 多规则合约一致，生成实例时复制规则；单值 reminderMinutes 只用于旧接口兼容。规则采用结构化 JSON：`frequency=daily/weekly/monthly`、正整数 `interval`、weekly 的 ISO weekday 数组、monthly 的 dayOfMonth、可空 inclusive `untilDate`。工作日为 `[1,2,3,4,5]`，不宣称包含法定调休。

新增 `task_occurrences(series_id,occurrence_date,item_id,status,is_exception)`，它是系列关联的唯一权威；`UNIQUE(series_id,occurrence_date)` 与唯一 item_id 保证实例生成幂等。item_id 可空，外键 `ON DELETE SET NULL`，发生记录永久保留为彻底删除后的 tombstone。实例落入 items，保存当次模板快照；status 为 active/skipped，完成状态由关联 items 读取。已跳过条目保留稳定身份，后续物化不得复活。归档、完成、删除实例也不能导致重新生成，手动修改设置 is_exception 保护单次例外。

月度 29/30/31 日规则在不存在该日的月份跳过，界面说明。使用系列自己的时区计算发生日期。生成范围有界：目标为当前日至 42 天后（包含端点），`materializedThroughDate` 记录连续处理进度；调度从系列起点或游标次日继续，每系列每次最多处理 366 个日历日，逐次补齐长期离线历史及未来窗口。物化在事务中先声明唯一发生键再创建任务。每个系列有独立 savepoint；DST 不存在/歧义时间导致该系列本批回滚、游标不前进，并持久保存 `materializationError` 的日期、时间、时区和原因，其余系列继续处理。错误在 GET /api/task-series 可读，当前没有专门恢复 UI；PATCH 修正时区/dueTime/规则后，下一次自动调度重试同一起点，成功时前移游标并清除错误。暂停系列停止重试；显式范围物化不会推进或清除自动游标/错误。

单次编辑只更新实例并标记例外，单次跳过只保留 skipped 状态并停用提醒。系列修改默认只影响此后尚未物化实例；UI 明确提示已生成任务保持原样。需要“此后全部”时在显式起点截断旧系列并建立新系列，保留旧历史与已经完成/例外项；首场景不依赖隐式级联更新。

接口：`POST /api/task-series` 创建并物化窗口；`PATCH /api/task-series/:id` 带 expectedVersion 更新模板/暂停；`POST /api/task-series/:id/materialize` 接收 fromDate/toDate；`POST /api/items/:id/skip` 带 expectedVersion，仅接受重复实例。创建与物化支持稳定 requestId 或持久化唯一发生键，重试不重复创建。

## 4. 多提醒与平台边界

新增 `task_reminder_rules(id,item_id,anchor,offset_minutes,version,enabled)`，item_id 外键级联删除，anchor 为 due/scheduled，offset 为非负提前分钟。规则附着真实任务或实例，多个规则可同时存在；唯一 `(item_id,anchor,offset_minutes)` 防止相同规则重复。日期截止没有默认凌晨提醒；需显式本地提醒时刻或时段锚点。

继续复用 `reminders` 调度记录和 `notification_events` 投递历史。调度身份包含 ruleId、规则版本和原始触发时间，时间/提前量修改后旧未投递记录失效，新记录按身份去重；历史投递记录保留。任务完成/删除/跳过停用待触发提醒。新版延期请求携带 requestId，`notification_snooze_requests` 持久绑定事件、minutes 和首次计算的绝对 scheduledAt；请求、事件及提醒更新处于同一事务。同 ID 同输入在延迟重试、重启及备份恢复后返回原 scheduledAt，不继续延期；同 ID 不同事件/时长返回 409。旧客户端省略 ID 仍为兼容调用，新 UI 使用稳定身份。

旧 `reminderMinutes` 映射为 due 提醒规则并保留兼容读写；兼容路径只能由一个转换函数维护，避免双调度。恢复后重建待触发调度，不重新投递已有投递身份。通知权限拒绝时应用内仍可见；应用休眠后补显并去重。

M1 交付应用运行时及恢复后的提醒能力。完全退出后的平台定时通知需目标平台单独实现和实测；不以当前 Tauri 通知镜像宣称后台可靠送达。该限制在 UI/验收中明确记录，保留后续平台调度适配接口。

## 5. 写入、版本与 AI 提案

`POST /api/items` 新增可选 `requestId`（UUID）和 `today: { localDate, isFocus, isSecondary }`，后者是设计中 todayDate 的实际结构化接口。新版 UI 必须发送稳定 requestId；服务端在同一事务内用 `item_create_requests.payload_json` 持久绑定原始规范化业务输入与 itemId，并完成可选日期关联。相同 requestId 与相同输入返回原任务；同 ID 不同输入返回 409。请求结果未知时客户端保留原输入和 requestId 重试，不生成新 ID 导致重复任务。请求绑定表纳入 v2 导出/恢复，彻底删除后保留 item_id=NULL 的请求身份以防重建；旧客户端省略 requestId 的兼容行为不作为新版防重保障。

新任务编辑和新业务接口携带 `expectedVersion`，事务内比较后写入。旧内部入口可暂时兼容缺省版本，但所有新版 UI 和 AI 更新必须传版本。分类、项目、日期安排、提醒以及回收站变化同样使相关任务版本变化。任何绕过 items repository 的 SQL 写入也须覆盖；版本触发器或统一 helper 二选一，以实际调用覆盖验证决定。

409 返回实体身份、当前版本和可读冲突。客户端保留未保存文字/提案，显示重新载入或对照后重试入口，不能自动覆盖本地输入。取消父任务编辑丢弃父草稿；子任务区明确提示添加/保存属于立即生效的独立操作，不随父草稿取消撤销。由当前编辑器发起的子任务成功操作推进它持有的父 expectedVersion，外部并发变化仍保留冲突而不自动接受。外层事务负责 AI 批量操作；repository 提供可在现有事务内调用的写入路径，避免嵌套 BEGIN。

新增任务提案使用独立版本化 `task_plan_runs`，旧 `plan_runs` 继续可读。提案类型 capture/replan，共享 requestId、`draftRevision`、状态、模型观测、取消、确认与执行核验；draftRevision 是下文草稿版本的实际字段名。requestId 绑定规范化输入，同 ID 不同输入冲突。

capture 保存原文，输出待编辑任务/系列草稿及歧义；“周五”按请求 referenceDate/timezone 解析，不能依赖模型服务器日期。保守模式只发送本次录入原文；replan 读取真实日历需要开放模式，创建提案和确认时均校验权限。确认前除运行记录外不写业务表。AI 失败/取消保留原文，提供手动拆分创建。

replan 从真实安排快照产生 create/move/keep 建议，包含 before/after、理由、未解决约束。快照包含所有受范围影响的任务字段、关系/版本、系列和工作时段；确认时重新查询整个范围以发现新会议，不能只比较原提案列出的任务。固定任务、已完成任务、用户明确锁定任务不得移动。

容量校验针对应用全部提案变更后的最终状态，已解决的原重叠不再阻断，未解决的原重叠仍可见。本次范围内已知耗时而被遗漏的未安排工作始终产生 `UNSCHEDULED_WORK`；同时检查每项能否放入连续空闲段，以及按截止时间前缀累计的总耗时是否超过剩余容量。该检查能拒绝已证明不可行及未处理的工作，不宣称提供一般调度问题的最优解。

用户编辑提案递增 draftRevision 并重新服务端验证；确认需匹配 draftRevision、数据快照、权限、状态和幂等键。在同一写事务内应用全部变更、读回核验并标记成功；失败回滚。成功重复确认直接返回已保存结果。取消状态用条件写入保护，迟到模型响应不覆盖。未保存提案编辑使用当前标签页 sessionStorage 暂存，刷新保留；关闭标签页后不承诺未保存草稿持久化，已存服务器的原文与运行记录不受影响。

## 6. 旧数据逐项迁移及恢复

| 旧数据 | 去向与核对 |
| --- | --- |
| items 内容、状态、时间戳、删除信息 | 原表原 ID 保留；新字段仅填安全默认值，dueAt 原值不改。 |
| 多分类、分类排序、项目关联 | 原关系原样保留，迁移前后逐行/计数核对。 |
| today_items 日期、排序、focus/secondary | 原表保留，无损读取为全天日期安排；不推导具体时段和耗时。 |
| reminderMinutes、reminders、notification_events | 生成等价规则，旧历史保留；已送达事件不补发。 |
| plan_runs、AI 会话/消息/行动记录 | 原记录 JSON 保留，可由旧页面读取；不强制解析为新版提案。 |
| 项目阶段/任务、笔记、习惯、回顾、trash/tutorial/settings | 保留原表及外键关系；新升级不更改历史业务语义。 |
| 旧 ZIP schemaVersion 1 | 接受缺少新表/新列，补默认值与等价提醒；严格验证未知危险结构。 |
| 新 ZIP 与 SQLite 备份 | 包含新表，恢复验证版本/外键/约束；排除 secrets 与模型鉴权。 |

在任何真实数据库升级前，用 SQLite backup API 生成带时间及源 schema 版本的独立快照，再开启迁移；仅在迁移后做每日备份不足以回退。快照失败必须阻止升级。开发及迁移验证使用备份副本；主数据目录保留不动。

新增顺序迁移，事务失败回滚该迁移；启动拒绝高于当前支持版本的数据库。回退方案是停应用、恢复升级前副本、启动原版本；不编写会删除新数据的 DOWN 迁移，也不让旧二进制继续写新版库。核对 schema 版本与已知迁移文件，记录升级前后 integrity_check / foreign_key_check 和逐类数据计数。

备份导出表清单、导入顺序、缺省列与恢复后校验一起更新。自引用 parent 和 series/occurrence 外键按正确顺序导入或使用事务内延迟检查。若关联触发器递增 version，恢复完成前重置为归档保存版本，保证往返后旧预览能正确识别恢复语义；事务提交前验证全部版本和关系。恢复使正在生成的模型运行失效，保留已成功结果幂等标识。

## 7. 范围与证据

M1 必须交付手动任务、子任务、优先级、日期/时段/耗时分离、常见重复与单次例外、多提醒、迁移恢复。首个完整场景继续实施所需 M2 日/周日历及容量、M3 AI 录入/重排，不能将 M0 文档当作产品完成。

固定模型回归记录流程和硬约束；真实模型评测单独记录模型、提示词版本、合成样本、语义缺陷、token/延迟；真实用户持续使用另记。跨设备同步、移动端技术、账号、云供应商、退出后平台提醒和两周持续使用仍为后续独立验收，不在此文档默认选型或宣称通过。
