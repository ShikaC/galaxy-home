import { DEFAULT_TASK_MINUTES } from "../../shared/taskCore.js"
import { FormDisclosure } from "./FormDisclosure.js"
import { TextArea, TextField } from "./ui/Field.js"
import type { ReminderDraft, TaskEditorDraft } from "./useTaskEditorDraft.js"

const REMINDER_OPTIONS = [
  { anchor: "due", offsetMinutes: 0, label: "截止时" },
  { anchor: "due", offsetMinutes: 30, label: "截止前 30 分钟" },
  { anchor: "due", offsetMinutes: 1440, label: "截止前 1 天" },
  { anchor: "scheduled", offsetMinutes: 0, label: "安排开始时" },
  { anchor: "scheduled", offsetMinutes: 10, label: "安排前 10 分钟" },
  { anchor: "scheduled", offsetMinutes: 30, label: "安排前 30 分钟" },
] as const satisfies readonly (ReminderDraft & { readonly label: string })[]

function sameReminder(left: ReminderDraft, right: ReminderDraft): boolean {
  return left.anchor === right.anchor && left.offsetMinutes === right.offsetMinutes
}

export function OrganizeScheduleFields({
  draft,
  onChange,
}: {
  readonly draft: TaskEditorDraft
  readonly onChange: (change: Partial<TaskEditorDraft>) => void
}) {
  const hasSchedule = draft.scheduledStartAt !== "" && draft.scheduledEndAt !== ""
  return (
    <FormDisclosure summary="说明、截止与安排">
      <div className="form-stack">
        <TextArea
          label="说明"
          maxLength={10_000}
          onChange={(event) => onChange({ notes: event.target.value })}
          rows={3}
          value={draft.notes}
        />
        <div className="form-grid">
          <TextField
            label="日期截止"
            onChange={(event) =>
              onChange({
                dueAt: "",
                dueDate: event.target.value,
                reminders: draft.reminders.filter((entry) => entry.anchor !== "due"),
              })
            }
            type="date"
            value={draft.dueDate}
          />
          <TextField
            label="时间截止"
            onChange={(event) =>
              onChange({
                dueAt: event.target.value,
                dueDate: "",
                ...(event.target.value === ""
                  ? { reminders: draft.reminders.filter((entry) => entry.anchor !== "due") }
                  : {}),
              })
            }
            type="datetime-local"
            value={draft.dueAt}
          />
        </div>
        <p className="form-hint">
          不用填耗时。把任务拖到日历上就会得到一个 {DEFAULT_TASK_MINUTES}{" "}
          分钟的块，再拖动边缘调成实际长度。
        </p>
        <div className="form-grid">
          <TextField
            label="安排开始"
            onChange={(event) =>
              onChange({
                scheduledStartAt: event.target.value,
                ...(event.target.value === ""
                  ? {
                      isFixed: false,
                      reminders: draft.reminders.filter((entry) => entry.anchor !== "scheduled"),
                    }
                  : {}),
              })
            }
            type="datetime-local"
            value={draft.scheduledStartAt}
          />
          <TextField
            label="安排结束"
            onChange={(event) =>
              onChange({
                scheduledEndAt: event.target.value,
                ...(event.target.value === ""
                  ? {
                      isFixed: false,
                      reminders: draft.reminders.filter((entry) => entry.anchor !== "scheduled"),
                    }
                  : {}),
              })
            }
            type="datetime-local"
            value={draft.scheduledEndAt}
          />
        </div>
        <label className="task-toggle">
          <input
            checked={draft.isFixed}
            disabled={!hasSchedule}
            onChange={(event) => onChange({ isFixed: event.target.checked })}
            type="checkbox"
          />
          <span>
            <strong>固定日程</strong>
            <small>AI 重排时保持此安排。</small>
          </span>
        </label>
        <fieldset className="choice-group">
          <legend>提醒（可多选）</legend>
          {REMINDER_OPTIONS.map((option) => {
            const disabled = option.anchor === "due" ? draft.dueAt === "" : !hasSchedule
            return (
              <label key={`${option.anchor}-${option.offsetMinutes}`}>
                <input
                  checked={draft.reminders.some((entry) => sameReminder(entry, option))}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      reminders: event.target.checked
                        ? [...draft.reminders, option]
                        : draft.reminders.filter((entry) => !sameReminder(entry, option)),
                    })
                  }
                  type="checkbox"
                />
                {option.label}
              </label>
            )
          })}
        </fieldset>
      </div>
    </FormDisclosure>
  )
}
