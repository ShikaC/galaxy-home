import type { RecurrenceRule } from "../../../shared/recurrence.js"
import { TextField } from "../ui/Field.js"

const weekdays = [
  [1, "周一"],
  [2, "周二"],
  [3, "周三"],
  [4, "周四"],
  [5, "周五"],
  [6, "周六"],
  [7, "周日"],
] as const
export function TaskPlanRecurrenceFields({
  rule,
  onChange,
}: {
  readonly rule: RecurrenceRule
  readonly onChange: (rule: RecurrenceRule) => void
}) {
  return (
    <>
      {rule.frequency === "weekly" ? (
        <fieldset className="task-plan-weekdays">
          <legend>重复星期</legend>
          {weekdays.map(([day, label]) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={rule.weekdays.includes(day)}
                onChange={(event) =>
                  onChange({
                    ...rule,
                    weekdays: event.target.checked
                      ? [...rule.weekdays, day].sort()
                      : rule.weekdays.filter((value) => value !== day),
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {rule.frequency === "monthly" ? (
        <TextField
          label="每月几号"
          type="number"
          min={1}
          max={31}
          value={rule.dayOfMonth}
          onChange={(event) => onChange({ ...rule, dayOfMonth: event.target.valueAsNumber })}
          hint="当月没有这个日期时跳过。"
        />
      ) : null}
      <TextField
        label="重复结束日期"
        type="date"
        value={rule.untilDate ?? ""}
        onChange={(event) => onChange({ ...rule, untilDate: event.target.value || null })}
      />
    </>
  )
}

export function taskPlanRuleLabel(rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case "daily":
      return `每 ${rule.interval} 天`
    case "weekly":
      return `每 ${rule.interval} 周 · ${weekdays
        .filter(([day]) => rule.weekdays.includes(day))
        .map(([, label]) => label)
        .join("、")}`
    case "monthly":
      return `每 ${rule.interval} 个月的 ${rule.dayOfMonth} 日（不存在则跳过）`
  }
}
