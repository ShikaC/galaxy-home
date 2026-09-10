import { useEffect, useState } from "react"
import { useBlocker } from "react-router"
import {
  normalizedTaskTitle,
  type PlanRun,
  type Proposal,
  planDate,
  planEditSchema,
} from "../../../shared/planning.js"
import { Button } from "../ui/Button.js"
import { TextField } from "../ui/Field.js"
import { DialogSurface } from "../ui/ModalSurface.js"

type Task = Proposal["tasks"][number]
export function PlanDraftEditor({
  run,
  pending,
  error,
  onSave,
  onClose,
}: {
  readonly run: PlanRun
  readonly pending: boolean
  readonly error: Error | null
  readonly onSave: (tasks: Proposal["tasks"]) => void
  readonly onClose: () => void
}) {
  const [rows, setRows] = useState(() =>
    (run.proposal?.tasks ?? []).map((task, index) => ({ key: index, task })),
  )
  const tasks = rows.map((row) => row.task)
  const dirty = JSON.stringify(tasks) !== JSON.stringify(run.proposal?.tasks)
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [dirty])
  const totals = Array.from({ length: run.input.horizonDays }, (_, day) =>
    tasks.filter((task) => task.dayOffset === day).reduce((sum, task) => sum + task.minutes, 0),
  )
  const valid =
    planEditSchema.safeParse({ expectedRevision: run.proposalRevision ?? 0, tasks }).success &&
    totals.every((total) => total <= run.input.dailyMinutes) &&
    new Set(tasks.map((task) => normalizedTaskTitle(task.title))).size === tasks.length
  const update = (key: number, patch: Partial<Task>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, task: { ...row.task, ...patch } } : row)),
    )
  return (
    <form
      className="plan-draft-editor"
      aria-label="调整行动计划"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onSave(tasks)
      }}
    >
      <header>
        <h3>把安排调到适合自己</h3>
        <p>调整不会调用模型。保存后再确认执行。</p>
      </header>
      <fieldset disabled={pending}>
        {rows.map(({ key, task }, index) => (
          <section className="plan-draft-task" key={key}>
            <TextField
              label={`任务 ${index + 1}`}
              required
              maxLength={240}
              value={task.title}
              readOnly={task.existingItemId !== null}
              {...(task.existingItemId ? { hint: "复用已有任务，保留原标题。" } : {})}
              onChange={(event) => update(key, { title: event.target.value })}
            />
            <p>{task.reason}</p>
            <div className="plan-edit-controls">
              <TextField
                label={`任务 ${index + 1} 分钟`}
                type="number"
                min={5}
                max={480}
                required
                value={Number.isNaN(task.minutes) ? "" : task.minutes}
                onChange={(event) => update(key, { minutes: event.target.valueAsNumber })}
              />
              <label className="field">
                <span className="field__label">任务 {index + 1} 日期</span>
                <select
                  className="field__control"
                  value={task.dayOffset}
                  onChange={(event) => update(key, { dayOffset: Number(event.target.value) })}
                >
                  {totals.map((_, day) => (
                    <option key={planDate(run.input.startDate, day)} value={day}>
                      {planDate(run.input.startDate, day)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                onClick={() => setRows((current) => current.filter((row) => row.key !== key))}
                aria-label={`移除任务 ${index + 1}`}
              >
                移除
              </Button>
            </div>
          </section>
        ))}
      </fieldset>
      <div className="plan-edit-totals" aria-live="polite">
        {totals.map((total, day) => (
          <p
            key={planDate(run.input.startDate, day)}
            className={total > run.input.dailyMinutes ? "inline-error" : ""}
          >
            {planDate(run.input.startDate, day)} ·{" "}
            {Number.isNaN(total) ? "请填写分钟" : `${total} / ${run.input.dailyMinutes} 分钟`}
            {total > run.input.dailyMinutes ? " · 超出可用时间" : ""}
          </p>
        ))}
      </div>
      {!valid ? (
        <p role="status">请保留至少一项任务，使用不同标题，并将每天安排控制在可用时间内。</p>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="button-row">
        <Button type="submit" disabled={!valid} loading={pending}>
          保存调整
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          放弃调整
        </Button>
      </div>
      {blocker.state === "blocked" ? (
        <DialogSurface
          ariaLabel="未保存的计划调整"
          className="dialog"
          onClose={() => blocker.reset()}
        >
          <h2>计划调整还未保存</h2>
          <p>离开将丢弃这次修改。</p>
          <div className="button-row">
            <Button variant="secondary" onClick={() => blocker.proceed()}>
              放弃并离开
            </Button>
            <Button onClick={() => blocker.reset()}>继续调整</Button>
          </div>
        </DialogSurface>
      ) : null}
    </form>
  )
}
