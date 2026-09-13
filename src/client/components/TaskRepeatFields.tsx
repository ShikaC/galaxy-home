import { z } from "zod"
import type { TaskSeries } from "../../shared/recurrence.js"
import { TextArea, TextField } from "./ui/Field.js"

export type RepeatKind = "daily" | "workday" | "weekly" | "monthly"
export type TaskSeriesDraft = {
  readonly dayOfMonth: string
  readonly dueTime: string
  readonly estimatedMinutes: string
  readonly interval: string
  readonly kind: RepeatKind
  readonly notes: string
  readonly priority: TaskSeries["priority"]
  readonly reminderOffsets: readonly number[]
  readonly startDate: string
  readonly title: string
  readonly untilDate: string
  readonly weekdays: readonly number[]
}

const WEEKDAYS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 7, label: "日" },
] as const
const prioritySchema = z.enum(["none", "low", "medium", "high"])
const repeatKindSchema = z.enum(["daily", "workday", "weekly", "monthly"])

export function TaskRepeatFields({
  draft,
  onChange,
  startDateEditable,
}: {
  readonly draft: TaskSeriesDraft
  readonly onChange: (change: Partial<TaskSeriesDraft>) => void
  readonly startDateEditable: boolean
}) {
  return (
    <div className="form-stack task-repeat-fields">
      <TextField
        autoFocus
        label="重复任务标题"
        maxLength={240}
        onChange={(event) => onChange({ title: event.target.value })}
        value={draft.title}
      />
      <TextArea
        label="说明"
        maxLength={10_000}
        onChange={(event) => onChange({ notes: event.target.value })}
        rows={2}
        value={draft.notes}
      />
      <div className="form-grid">
        <label className="field">
          <span className="field__label">优先级</span>
          <select
            className="field__control"
            onChange={(event) => onChange({ priority: prioritySchema.parse(event.target.value) })}
            value={draft.priority}
          >
            <option value="none">无</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </label>
        <TextField
          {...(startDateEditable ? {} : { hint: "系列创建后不能修改开始日期。" })}
          disabled={!startDateEditable}
          label="开始日期"
          onChange={(event) => onChange({ startDate: event.target.value })}
          type="date"
          value={draft.startDate}
        />
        <label className="field">
          <span className="field__label">重复方式</span>
          <select
            className="field__control"
            onChange={(event) => onChange({ kind: repeatKindSchema.parse(event.target.value) })}
            value={draft.kind}
          >
            <option value="daily">每天</option>
            <option value="workday">每个工作日（周一至周五）</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </label>
        <TextField
          label="间隔"
          min={1}
          onChange={(event) => onChange({ interval: event.target.value })}
          type="number"
          value={draft.interval}
        />
      </div>
      {draft.kind === "weekly" ? (
        <fieldset className="weekday-picker">
          <legend>星期</legend>
          {WEEKDAYS.map((day) => (
            <label key={day.value}>
              <input
                checked={draft.weekdays.includes(day.value)}
                onChange={() =>
                  onChange({
                    weekdays: draft.weekdays.includes(day.value)
                      ? draft.weekdays.filter((value) => value !== day.value)
                      : [...draft.weekdays, day.value].sort(),
                  })
                }
                type="checkbox"
              />
              <span>{day.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {draft.kind === "monthly" ? (
        <TextField
          hint="当月没有这一天时会跳过，例如 31 日不会挪到月末。"
          label="每月日期"
          max={31}
          min={1}
          onChange={(event) => onChange({ dayOfMonth: event.target.value })}
          type="number"
          value={draft.dayOfMonth}
        />
      ) : null}
      <div className="form-grid">
        <TextField
          label="截止时刻"
          onChange={(event) => {
            const dueTime = event.target.value
            onChange({ dueTime, ...(dueTime ? {} : { reminderOffsets: [] }) })
          }}
          type="time"
          value={draft.dueTime}
        />
        <TextField
          label="预计耗时（分钟）"
          max={1440}
          min={1}
          onChange={(event) => onChange({ estimatedMinutes: event.target.value })}
          type="number"
          value={draft.estimatedMinutes}
        />
        <TextField
          label="结束日期"
          min={draft.startDate}
          onChange={(event) => onChange({ untilDate: event.target.value })}
          type="date"
          value={draft.untilDate}
        />
      </div>
      <fieldset className="choice-group">
        <legend>截止提醒（可多选）</legend>
        {[0, 30, 1440].map((offset) => (
          <label key={offset}>
            <input
              checked={draft.reminderOffsets.includes(offset)}
              disabled={!draft.dueTime}
              onChange={(event) =>
                onChange({
                  reminderOffsets: event.target.checked
                    ? [...draft.reminderOffsets, offset]
                    : draft.reminderOffsets.filter((value) => value !== offset),
                })
              }
              type="checkbox"
            />
            {offset === 0 ? "截止时" : offset === 30 ? "提前 30 分钟" : "提前 1 天"}
          </label>
        ))}
      </fieldset>
    </div>
  )
}
