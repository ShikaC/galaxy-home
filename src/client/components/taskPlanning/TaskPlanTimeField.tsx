import { z } from "zod"
import { localOccurrenceInstant, RecurrenceLocalTimeError } from "../../../shared/recurrence.js"
import { localDateTimeInputFor } from "../../lib/date.js"
import { TextField } from "../ui/Field.js"

export function TaskPlanTimeField({
  label,
  value,
  timezone,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly timezone: string
  readonly onChange: (value: string) => void
}) {
  const valid = z.iso.datetime().safeParse(value).success
  return (
    <TextField
      label={label}
      aria-label={label}
      type="datetime-local"
      required
      value={valid ? localDateTimeInputFor(value, timezone) : value}
      hint={`时区：${timezone}`}
      {...(!valid && value !== "" ? { error: "此时间不存在或有夏令时歧义，请选择其他时间。" } : {})}
      onChange={(event) => {
        const local = event.target.value
        const [date, time] = local.split("T")
        if (!date || !time) {
          onChange(local)
          return
        }
        try {
          onChange(localOccurrenceInstant(date, time, timezone).toISOString())
        } catch (error) {
          if (!(error instanceof RecurrenceLocalTimeError || error instanceof z.ZodError))
            throw error
          onChange(local)
        }
      }}
    />
  )
}
