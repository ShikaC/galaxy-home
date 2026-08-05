import { TZDate } from "@date-fns/tz"
import { subDays } from "date-fns"

export function localDateFor(timezone: string, instant = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant)
}

export function localDateTimeInputFor(instant: string, timezone: string): string {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`
}

export function instantForLocalDateTimeInput(value: string, timezone: string): string | null {
  const [datePart, timePart] = value.split("T")
  if (datePart === undefined || timePart === undefined) return null
  const [year, month, day] = datePart.split("-").map(Number)
  const [hour, minute] = timePart.split(":").map(Number)
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    ![year, month, day, hour, minute].every(Number.isFinite)
  )
    return null
  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, timezone)
  return new Date(zoned.getTime()).toISOString()
}

export function previousCalendarDate(localDate: string): string {
  return subDays(new Date(`${localDate}T12:00:00.000Z`), 1)
    .toISOString()
    .slice(0, 10)
}
