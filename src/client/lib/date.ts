import { subDays } from "date-fns"

export function localDateFor(timezone: string, instant = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant)
}

export function previousCalendarDate(localDate: string): string {
  return subDays(new Date(`${localDate}T12:00:00.000Z`), 1)
    .toISOString()
    .slice(0, 10)
}
