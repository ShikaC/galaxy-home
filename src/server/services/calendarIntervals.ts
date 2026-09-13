import { TZDate } from "@date-fns/tz"
import { addDays } from "date-fns"
import {
  type CalendarItem,
  type CalendarQuery,
  defaultWorkWindow,
  type WorkWindowRule,
} from "../../shared/calendar.js"
import { localDateTimeToInstant } from "./time.js"
export type Interval = { readonly start: number; readonly end: number }

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function datesBetween(startDate: string, endDate: string): readonly string[] {
  const dates: string[] = []
  for (
    let date = new Date(`${startDate}T12:00:00.000Z`);
    isoDate(date) < endDate;
    date = addDays(date, 1)
  )
    dates.push(isoDate(date))
  return dates
}

export function rangeInstants(query: CalendarQuery): Interval {
  return {
    start: localDateTimeToInstant(query.startDate, "00:00", query.timezone).getTime(),
    end: localDateTimeToInstant(query.endDate, "00:00", query.timezone).getTime(),
  }
}

export function dayWindows(
  localDate: string,
  timezone: string,
  rules: readonly WorkWindowRule[],
): readonly Interval[] {
  const noon = new Date(`${localDate}T12:00:00.000Z`)
  const windows = rules
    .filter((value) => value.weekday === noon.getUTCDay())
    .map((rule) => ({
      start: localDateTimeToInstant(localDate, rule.startTime, timezone).getTime(),
      end: localDateTimeToInstant(localDate, rule.endTime, timezone).getTime(),
    }))
    .sort((left, right) => left.start - right.start)
  const merged: Interval[] = []
  for (const window of windows) {
    const last = merged.at(-1)
    if (last === undefined || window.start > last.end) merged.push(window)
    else if (window.end > last.end)
      merged[merged.length - 1] = { start: last.start, end: window.end }
  }
  return merged
}

export function overlaps(left: Interval, right: Interval): boolean {
  return left.start < right.end && right.start < left.end
}

export function intervalFor(item: CalendarItem): Interval | null {
  if (item.scheduledStartAt === null || item.scheduledEndAt === null) return null
  return { start: Date.parse(item.scheduledStartAt), end: Date.parse(item.scheduledEndAt) }
}

export function localDateAt(instant: number, timezone: string): string {
  const date = new TZDate(instant, timezone)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function freeSlots(items: readonly CalendarItem[], query: CalendarQuery) {
  const rules = query.workWindow ?? defaultWorkWindow
  return datesBetween(query.startDate, query.endDate).flatMap((localDate) => {
    return dayWindows(localDate, query.timezone, rules).flatMap((window) => {
      const occupied = items
        .flatMap((item) => {
          const interval = intervalFor(item)
          if (interval === null || !overlaps(interval, window)) return []
          return [
            {
              start: Math.max(interval.start, window.start),
              end: Math.min(interval.end, window.end),
            },
          ]
        })
        .sort((left, right) => left.start - right.start)
      const merged: Interval[] = []
      for (const interval of occupied) {
        const last = merged.at(-1)
        if (last === undefined || interval.start > last.end) merged.push(interval)
        else if (interval.end > last.end)
          merged[merged.length - 1] = { start: last.start, end: interval.end }
      }
      const slots: Interval[] = []
      let cursor = window.start
      for (const interval of merged) {
        if (cursor < interval.start) slots.push({ start: cursor, end: interval.start })
        cursor = Math.max(cursor, interval.end)
      }
      if (cursor < window.end) slots.push({ start: cursor, end: window.end })
      return slots.map((slot) => ({
        localDate,
        startAt: new Date(slot.start).toISOString(),
        endAt: new Date(slot.end).toISOString(),
        minutes: Math.round((slot.end - slot.start) / 60_000),
      }))
    })
  })
}
