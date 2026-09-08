import { FormDisclosure } from "./FormDisclosure.js"
import { TextArea, TextField } from "./ui/Field.js"

export type OrganizeScheduleDraft = {
  readonly dueAt: string
  readonly notes: string
  readonly reminder: string
}

export function OrganizeScheduleFields({
  draft,
  onChange,
}: {
  readonly draft: OrganizeScheduleDraft
  readonly onChange: (next: OrganizeScheduleDraft) => void
}) {
  return (
    <FormDisclosure summary="备注与时间（可选）">
      <div className="form-stack">
        <TextArea
          label="备注"
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          rows={2}
          value={draft.notes}
        />
        <div className="form-grid">
          <TextField
            label="截止时间"
            onChange={(event) => onChange({ ...draft, dueAt: event.target.value })}
            type="datetime-local"
            value={draft.dueAt}
          />
          <label className="field">
            <span className="field__label">提醒</span>
            <select
              className="field__control"
              disabled={!draft.dueAt}
              onChange={(event) => onChange({ ...draft, reminder: event.target.value })}
              value={draft.reminder}
            >
              <option value="">不提醒</option>
              <option value="0">截止时</option>
              <option value="30">提前 30 分钟</option>
              <option value="1440">提前 1 天</option>
            </select>
          </label>
        </div>
      </div>
    </FormDisclosure>
  )
}
