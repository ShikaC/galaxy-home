import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Plus } from "lucide-react"
import type { CalendarSnapshot } from "../../../shared/calendar.js"
import type { TaskPlanProposal } from "../../../shared/taskPlanning.js"
import { localDateTimeInputFor } from "../../lib/date.js"
import { taskPlanRuleLabel } from "./TaskPlanRecurrenceFields.js"

const priorityLabels = {
  none: "无优先级",
  low: "低优先级",
  medium: "中优先级",
  high: "高优先级",
} as const

function TaskPlanSchedule({
  label,
  startAt,
  endAt,
  timezone,
}: {
  readonly label: string
  readonly startAt: string
  readonly endAt: string
  readonly timezone: string
}) {
  return (
    <p className="task-plan-schedule">
      <span className="task-plan-time-label">{label}</span>
      <time className="task-plan-token" dateTime={startAt}>
        {localDateTimeInputFor(startAt, timezone).replace("T", " ")}
      </time>{" "}
      <span className="task-plan-token">
        → <time dateTime={endAt}>{localDateTimeInputFor(endAt, timezone).replace("T", " ")}</time>
      </span>
    </p>
  )
}

export function TaskPlanProposalView({
  proposal,
  snapshot,
}: {
  readonly proposal: TaskPlanProposal
  readonly snapshot: CalendarSnapshot | null
}) {
  if (proposal.kind === "capture")
    return (
      <div className="task-plan-proposal">
        <section>
          <h3>单次任务 · {proposal.tasks.length}</h3>
          <div className="task-plan-card-list">
            {proposal.tasks.map((task) => (
              <article className="task-plan-change-card" key={task.draftId}>
                <CircleDot size={18} aria-hidden="true" />
                <div>
                  <strong>{task.title}</strong>
                  <p>
                    <span className="task-plan-token">{priorityLabels[task.priority]}</span>
                    {" · "}
                    <span className="task-plan-token">
                      {task.dueDate ? `截止 ${task.dueDate}` : "无截止日期"}
                    </span>
                    {" · "}
                    <span className="task-plan-token">
                      {task.estimatedMinutes ? `${task.estimatedMinutes} 分钟` : "耗时待补充"}
                    </span>
                  </p>
                  {task.notes ? <p>{task.notes}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h3>重复任务 · {proposal.series.length}</h3>
          <div className="task-plan-card-list">
            {proposal.series.map((series) => (
              <article className="task-plan-change-card" key={series.draftId}>
                <CheckCircle2 size={18} aria-hidden="true" />
                <div>
                  <strong>{series.title}</strong>
                  <p>
                    {taskPlanRuleLabel(series.rule)
                      .split(/(?<=、)| · |(?=（)/u)
                      .map((token, index) => (
                        <span className="task-plan-token" key={token}>
                          {index > 0 ? " " : ""}
                          {token}
                        </span>
                      ))}
                    {" · "}
                    <span className="task-plan-token">从 {series.startDate} 开始</span>
                    {series.dueTime ? (
                      <>
                        {" "}
                        · <span className="task-plan-token">{series.dueTime} 截止</span>
                      </>
                    ) : null}
                  </p>
                  {series.notes ? <p>{series.notes}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
        {proposal.ambiguities.length > 0 ? (
          <section className="task-plan-conflicts">
            <h3>
              <AlertTriangle size={17} /> 需要补充的信息
            </h3>
            <ul>
              {proposal.ambiguities.map((ambiguity) => (
                <li key={ambiguity}>{ambiguity}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    )

  return (
    <div className="task-plan-proposal">
      <section>
        <h3>安排变更 · {proposal.changes.length}</h3>
        <div className="task-plan-card-list">
          {proposal.changes.map((change) => (
            <article
              className={`task-plan-change-card task-plan-change-card--${change.action}`}
              key={`${change.action}-${"itemId" in change ? change.itemId : change.draftId}`}
            >
              {change.action === "create" ? (
                <Plus size={18} />
              ) : change.action === "move" ? (
                <ArrowRight size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
              <div>
                <span className="task-plan-action">
                  {change.action === "keep"
                    ? "保持不变"
                    : change.action === "move"
                      ? "移动"
                      : "新建并安排"}
                </span>
                <strong>
                  {change.action === "create"
                    ? change.title
                    : (snapshot?.items.find((item) => item.id === change.itemId)?.title ??
                      `任务 ${change.itemId}`)}
                </strong>
                {"before" in change && change.before ? (
                  <TaskPlanSchedule
                    label="原安排"
                    startAt={change.before.startAt}
                    endAt={change.before.endAt}
                    timezone={change.before.timezone}
                  />
                ) : (
                  <p>
                    <span className="task-plan-time-label">原安排</span> 未安排
                  </p>
                )}
                {change.after ? (
                  <TaskPlanSchedule
                    label="新安排"
                    startAt={change.after.startAt}
                    endAt={change.after.endAt}
                    timezone={change.after.timezone}
                  />
                ) : (
                  <p>
                    <span className="task-plan-time-label">新安排</span> 保持未安排
                  </p>
                )}
                <p className="task-plan-reason">原因：{change.reason}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="task-plan-conflicts">
        <h3>
          <AlertTriangle size={17} /> 未解决冲突 · {proposal.unresolvedConflicts.length}
        </h3>
        {proposal.unresolvedConflicts.length === 0 ? (
          <p>当前提案没有未解决冲突。</p>
        ) : (
          <ul>
            {proposal.unresolvedConflicts.map((conflict) => (
              <li
                className={conflict.blocking ? "is-blocking" : ""}
                key={`${conflict.code}-${conflict.itemId ?? conflict.message}`}
              >
                <strong>{conflict.blocking ? "阻断确认" : "请留意"}</strong> · {conflict.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
