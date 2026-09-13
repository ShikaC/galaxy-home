import { addDays } from "date-fns"
import { strictInstantForLocalInput } from "../components/useTaskEditorDraft.js"

export function shiftDate(localDate: string, amount: number): string {
  return addDays(new Date(`${localDate}T12:00:00.000Z`), amount)
    .toISOString()
    .slice(0, 10)
}

export function weekStart(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00.000Z`)
  const mondayOffset = (date.getUTCDay() + 6) % 7
  return shiftDate(localDate, -mondayOffset)
}

export function localInstant(value: string, timezone: string): string {
  return strictInstantForLocalInput(value, timezone) ?? ""
}

export function localDateTimeFromInstant(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values["year"]}-${values["month"]}-${values["day"]}T${values["hour"]}:${values["minute"]}`
}
