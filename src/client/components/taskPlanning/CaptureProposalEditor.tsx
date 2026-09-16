import type { RecurrenceRule } from "../../../shared/recurrence.js"
import { DEFAULT_TASK_MINUTES } from "../../../shared/taskCore.js"
import type { TaskPlanProposal } from "../../../shared/taskPlanning.js"
import { Button } from "../ui/Button.js"
import { TextArea, TextField } from "../ui/Field.js"
import { TaskPlanRecurrenceFields } from "./TaskPlanRecurrenceFields.js"

type CaptureProposal = Extract<TaskPlanProposal, { readonly kind: "capture" }>
type CaptureTask = CaptureProposal["tasks"][number]
type CaptureSeries = CaptureProposal["series"][number]

const priorities = [
  ["none", "无"],
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
] as const

function nullableText(value: string): string | null {
  return value.trim() === "" ? null : value
}

function ruleForFrequency(frequency: RecurrenceRule["frequency"]): RecurrenceRule {
  switch (frequency) {
    case "daily":
      return { frequency, interval: 1, untilDate: null }
    case "weekly":
      return { frequency, interval: 1, weekdays: [1, 2, 3, 4, 5], untilDate: null }
    case "monthly":
      return { frequency, interval: 1, dayOfMonth: 1, untilDate: null }
  }
}

export function CaptureProposalEditor({
  proposal,
  onChange,
}: {
  readonly proposal: CaptureProposal
  readonly onChange: (proposal: CaptureProposal) => void
}) {
  const updateTask = (draftId: string, patch: Partial<CaptureTask>) =>
    onChange({
      ...proposal,
      tasks: proposal.tasks.map((task) =>
        task.draftId === draftId ? { ...task, ...patch } : task,
      ),
    })
  const updateSeries = (draftId: string, patch: Partial<CaptureSeries>) =>
    onChange({
      ...proposal,
      series: proposal.series.map((series) =>
        series.draftId === draftId ? { ...series, ...patch } : series,
      ),
    })

  return (
    <div className="task-plan-editor-groups">
      {proposal.ambiguities.length > 0 ? (
        <section className="task-plan-conflicts">
          <h3>待澄清事项</h3>
          {proposal.ambiguities.map((text, index) => (
            <label key={text}>
              <input
                type="checkbox"
                checked={false}
                onChange={() =>
                  onChange({
                    ...proposal,
                    ambiguities: proposal.ambiguities.filter((_, position) => position !== index),
                  })
                }
              />{" "}
              我已在草稿中解决：{text}
            </label>
          ))}
        </section>
      ) : null}
      {proposal.tasks.map((task, index) => (
        <fieldset className="task-plan-edit-card" key={task.draftId}>
          <legend>单次任务 {index + 1}</legend>
          <TextField
            label={`任务 ${index + 1} 标题`}
            required
            maxLength={240}
            value={task.title}
            onChange={(event) => updateTask(task.draftId, { title: event.target.value })}
          />
          <TextArea
            label={`任务 ${index + 1} 说明`}
            rows={2}
            maxLength={10_000}
            value={task.notes ?? ""}
            onChange={(event) =>
              updateTask(task.draftId, { notes: nullableText(event.target.value) })
            }
          />
          <div className="task-plan-edit-grid">
            <label className="field">
              <span className="field__label">任务 {index + 1} 优先级</span>
              <select
                className="field__control"
                value={task.priority}
                onChange={(event) => {
                  const parsed = priorities.find(([value]) => value === event.target.value)
                  if (parsed !== undefined) updateTask(task.draftId, { priority: parsed[0] })
                }}
              >
                {priorities.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label={`任务 ${index + 1} 截止日期`}
              type="date"
              value={task.dueDate ?? ""}
              onChange={(event) =>
                updateTask(task.draftId, { dueDate: nullableText(event.target.value) })
              }
            />
          </div>
          <p className="proposal-duration">
            AI 估算约 {task.estimatedMinutes ?? DEFAULT_TASK_MINUTES}{" "}
            分钟；排到日历后拖动边缘即可调整。
          </p>
          <Button
            variant="ghost"
            onClick={() =>
              onChange({
                ...proposal,
                tasks: proposal.tasks.filter((entry) => entry.draftId !== task.draftId),
              })
            }
          >
            移除此任务
          </Button>
        </fieldset>
      ))}
      {proposal.series.map((series, index) => (
        <fieldset className="task-plan-edit-card" key={series.draftId}>
          <legend>重复任务 {index + 1}</legend>
          <TextField
            label={`重复任务 ${index + 1} 标题`}
            required
            value={series.title}
            onChange={(event) => updateSeries(series.draftId, { title: event.target.value })}
          />
          <TextArea
            label={`重复任务 ${index + 1} 说明`}
            rows={2}
            value={series.notes ?? ""}
            onChange={(event) =>
              updateSeries(series.draftId, { notes: nullableText(event.target.value) })
            }
          />
          <div className="task-plan-edit-grid">
            <label className="field">
              <span className="field__label">重复频率</span>
              <select
                className="field__control"
                value={series.rule.frequency}
                onChange={(event) => {
                  if (
                    event.target.value === "daily" ||
                    event.target.value === "weekly" ||
                    event.target.value === "monthly"
                  )
                    updateSeries(series.draftId, { rule: ruleForFrequency(event.target.value) })
                }}
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </label>
            <TextField
              label="间隔"
              type="number"
              min={1}
              value={series.rule.interval}
              onChange={(event) =>
                updateSeries(series.draftId, {
                  rule: { ...series.rule, interval: event.target.valueAsNumber },
                })
              }
            />
            <TextField
              label="开始日期"
              type="date"
              required
              value={series.startDate}
              onChange={(event) => updateSeries(series.draftId, { startDate: event.target.value })}
            />
            <TextField
              label="截止时间"
              type="time"
              value={series.dueTime ?? ""}
              onChange={(event) =>
                updateSeries(series.draftId, { dueTime: nullableText(event.target.value) })
              }
            />
          </div>
          <p className="proposal-duration">
            AI 估算每次约 {series.estimatedMinutes ?? DEFAULT_TASK_MINUTES}{" "}
            分钟；排到日历后拖动边缘即可调整。
          </p>
          <TaskPlanRecurrenceFields
            rule={series.rule}
            onChange={(rule) => updateSeries(series.draftId, { rule })}
          />
          <Button
            variant="ghost"
            onClick={() =>
              onChange({
                ...proposal,
                series: proposal.series.filter((entry) => entry.draftId !== series.draftId),
              })
            }
          >
            移除此重复任务
          </Button>
        </fieldset>
      ))}
    </div>
  )
}
