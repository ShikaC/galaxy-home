import { z } from "zod"
import {
  localDateSchema,
  localTimeSchema,
  type RecurrenceRule,
  recurrenceRuleSchema,
} from "./recurrence.js"

const millisecondsPerDay = 86_400_000
const wallPartsSchema = z.object({
  year: z.string(),
  month: z.string(),
  day: z.string(),
  hour: z.string(),
  minute: z.string(),
})

function calendarDayNumber(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00.000Z`).getTime() / millisecondsPerDay)
}

function isoWeekday(dayNumber: number): number {
  return ((dayNumber + 3) % 7) + 1
}

function matchesRule(rule: RecurrenceRule, startDay: number, candidateDay: number): boolean {
  switch (rule.frequency) {
    case "daily":
      return (candidateDay - startDay) % rule.interval === 0
    case "weekly": {
      const startMonday = startDay - (isoWeekday(startDay) - 1)
      const candidateWeek = Math.floor((candidateDay - startMonday) / 7)
      return candidateWeek % rule.interval === 0 && rule.weekdays.includes(isoWeekday(candidateDay))
    }
    case "monthly": {
      const start = new Date(startDay * millisecondsPerDay)
      const candidate = new Date(candidateDay * millisecondsPerDay)
      const elapsedMonths =
        (candidate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        candidate.getUTCMonth() -
        start.getUTCMonth()
      return elapsedMonths % rule.interval === 0 && candidate.getUTCDate() === rule.dayOfMonth
    }
  }
}

export function occurrenceDates(
  ruleInput: RecurrenceRule,
  startDateInput: string,
  fromDateInput: string,
  toDateInput: string,
): readonly string[] {
  const rule = recurrenceRuleSchema.parse(ruleInput)
  const startDate = localDateSchema.parse(startDateInput)
  const fromDate = localDateSchema.parse(fromDateInput)
  const toDate = localDateSchema.parse(toDateInput)
  const firstDay = Math.max(calendarDayNumber(startDate), calendarDayNumber(fromDate))
  const requestedLastDay = calendarDayNumber(toDate)
  const untilDay = rule.untilDate == null ? requestedLastDay : calendarDayNumber(rule.untilDate)
  const lastDay = Math.min(requestedLastDay, untilDay)
  const startDay = calendarDayNumber(startDate)
  const dates: string[] = []
  for (let candidate = firstDay; candidate <= lastDay; candidate += 1) {
    if (matchesRule(rule, startDay, candidate)) {
      dates.push(new Date(candidate * millisecondsPerDay).toISOString().slice(0, 10))
    }
  }
  return dates
}

export function nextOccurrenceDate(
  rule: RecurrenceRule,
  startDate: string,
  afterDate: string,
): string | null {
  const fromDate = new Date(`${localDateSchema.parse(afterDate)}T00:00:00.000Z`)
  fromDate.setUTCDate(fromDate.getUTCDate() + 1)
  return (
    occurrenceDates(
      rule,
      startDate,
      fromDate.toISOString().slice(0, 10),
      new Date(fromDate.getTime() + 3_660 * millisecondsPerDay).toISOString().slice(0, 10),
    )[0] ?? null
  )
}

export class RecurrenceLocalTimeError extends Error {
  readonly name = "RecurrenceLocalTimeError"

  constructor(
    readonly localDate: string,
    readonly localTime: string,
    readonly timezone: string,
    readonly reason: "nonexistent" | "ambiguous",
  ) {
    super(`Recurring wall time is ${reason}: ${localDate} ${localTime} ${timezone}`)
  }
}

function wallTimeParts(formatter: Intl.DateTimeFormat, instant: Date): string {
  const values = wallPartsSchema.parse(
    Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value])),
  )
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

export function localOccurrenceInstant(
  localDateInput: string,
  localTimeInput: string,
  timezone: string,
): Date {
  const localDate = localDateSchema.parse(localDateInput)
  const localTime = localTimeSchema.parse(localTimeInput)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const expected = `${localDate}T${localTime}`
  const nominal = new Date(`${expected}:00.000Z`).getTime()
  const matches: Date[] = []
  for (let minuteOffset = -14 * 60; minuteOffset <= 14 * 60; minuteOffset += 15) {
    const candidate = new Date(nominal + minuteOffset * 60_000)
    if (wallTimeParts(formatter, candidate) === expected) matches.push(candidate)
  }
  if (matches.length === 1) return matches[0] ?? new Date(Number.NaN)
  throw new RecurrenceLocalTimeError(
    localDate,
    localTime,
    timezone,
    matches.length === 0 ? "nonexistent" : "ambiguous",
  )
}
