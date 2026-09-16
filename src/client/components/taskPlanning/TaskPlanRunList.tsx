import { History } from "lucide-react"
import type { TaskPlanRun } from "../../../shared/taskPlanning.js"
import { taskPlanInputKind, taskPlanInputText } from "../../../shared/taskPlanning.js"
import { taskPlanStatusLabel } from "./TaskPlanningRunDetail.js"

export function TaskPlanRunList({
  loading,
  error,
  runs,
  selectedId,
  onSelect,
}: {
  readonly error: Error | null
  readonly loading: boolean
  readonly onSelect: (id: string) => void
  readonly runs: readonly TaskPlanRun[]
  readonly selectedId: string | null
}) {
  return (
    <aside className="task-plan-history" aria-label="任务规划运行记录">
      <h2>
        <History size={16} /> 最近运行
      </h2>
      {loading ? <p role="status">正在读取运行记录…</p> : null}
      {error ? (
        <p className="inline-error" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && runs.length === 0 ? (
        <p>自然语言录入、日历重排和从笔记规划都会作为可恢复的运行保存在这里。</p>
      ) : null}
      <div className="task-plan-history__list">
        {runs.map((run) => (
          <button
            type="button"
            key={run.id}
            aria-current={selectedId === run.id ? "true" : undefined}
            onClick={() => onSelect(run.id)}
          >
            <strong>{taskPlanInputText(run.input)}</strong>
            <span>
              {taskPlanInputKind(run.input)} · {taskPlanStatusLabel[run.status]}
            </span>
            <time dateTime={run.updatedAt}>{run.updatedAt.slice(0, 16).replace("T", " ")}</time>
          </button>
        ))}
      </div>
    </aside>
  )
}
