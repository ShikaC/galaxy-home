import { TZDate } from "@date-fns/tz"
import { addDays, subDays } from "date-fns"
import { z } from "zod"

export type LocalClock = {
  readonly date: string
  readonly time: string
  readonly weekday: number
}

export function localClock(instant: Date, timezone: string): LocalClock {
  const zoned = new TZDate(instant, timezone)
  const year = String(zoned.getFullYear()).padStart(4, "0")
  const month = String(zoned.getMonth() + 1).padStart(2, "0")
  const day = String(zoned.getDate()).padStart(2, "0")
  const hour = String(zoned.getHours()).padStart(2, "0")
  const minute = String(zoned.getMinutes()).padStart(2, "0")
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}`, weekday: zoned.getDay() }
}

export function localDateTimeToInstant(
  localDate: string,
  localTime: string,
  timezone: string,
): Date {
  const [year, month, day] = z
    .tuple([z.number().int(), z.number().int(), z.number().int()])
    .parse(localDate.split("-").map(Number))
  const [hour, minute] = z
    .tuple([z.number().int(), z.number().int()])
    .parse(localTime.split(":").map(Number))
  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, timezone)
  return new Date(zoned.getTime())
}

export function shiftCalendarDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T12:00:00.000Z`)
  return (days < 0 ? subDays(date, Math.abs(days)) : addDays(date, days)).toISOString().slice(0, 10)
}
