import type { DatabaseSync } from "node:sqlite"
import { createItemInputSchema } from "../../shared/items.js"
import {
  localOccurrenceInstant,
  nextOccurrenceDate,
  occurrenceDates,
  RecurrenceLocalTimeError,
  type TaskSeries,
} from "../../shared/recurrence.js"
import { createItem, getItem } from "../repositories/items.js"
import {
  attachOccurrenceItem,
  claimOccurrence,
  getOccurrenceByItem,
} from "../repositories/taskOccurrences.js"
import {
  existingSeriesRelationIds,
  getTaskSeries,
  listActiveTaskSeries,
  recordSeriesMaterialization,
} from "../repositories/taskSeries.js"
import { withImmediateTransaction } from "../repositories/transaction.js"
import { localClock, shiftCalendarDate } from "./time.js"

type MaterializeRange = {
  readonly fromDate: string
  readonly toDate: string
}

function createOccurrenceItem(
  database: DatabaseSync,
  series: TaskSeries,
  occurrenceDate: string,
  instant: Date,
): void {
  const dueAt =
    series.dueTime === null
      ? undefined
      : localOccurrenceInstant(occurrenceDate, series.dueTime, series.timezone).toISOString()
  const input = createItemInputSchema.parse({
    title: series.title,
    ...(series.notes === null ? {} : { notes: series.notes }),
    priority: series.priority,
    categoryIds: series.categoryIds,
    projectIds: series.projectIds,
    ...(series.estimatedMinutes === null ? {} : { estimatedMinutes: series.estimatedMinutes }),
    ...(dueAt === undefined ? {} : { dueAt }),
    ...(series.reminderMinutes === null ? {} : { reminderMinutes: series.reminderMinutes }),
    ...(series.reminders.length === 0 && series.reminderMinutes !== null
      ? {}
      : { reminders: series.reminders }),
  })
  const item = createItem(database, input, occurrenceDate, instant)
  attachOccurrenceItem(database, series.id, occurrenceDate, item.id, instant)
}

function materializeSeries(
  database: DatabaseSync,
  series: TaskSeries,
  range: MaterializeRange,
  instant: Date,
): number {
  if (series.status !== "active") return 0
  const materializedTemplate = {
    ...series,
    categoryIds: existingSeriesRelationIds(database, "categories", series.categoryIds),
    projectIds: existingSeriesRelationIds(database, "projects", series.projectIds),
  }
  let createdCount = 0
  for (const date of occurrenceDates(series.rule, series.startDate, range.fromDate, range.toDate)) {
    if (!claimOccurrence(database, series.id, date, instant)) continue
    createOccurrenceItem(database, materializedTemplate, date, instant)
    createdCount += 1
  }
  return createdCount
}

export function materializeTaskSeries(
  database: DatabaseSync,
  seriesId: string,
  range: MaterializeRange,
  instant: Date,
): number {
  return withImmediateTransaction(database, () =>
    materializeSeries(database, getTaskSeries(database, seriesId), range, instant),
  )
}

export function materializeRecurringTasks(
  database: DatabaseSync,
  instant: Date,
  throughLocalDate?: string,
): number {
  return withImmediateTransaction(database, () => {
    let createdCount = 0
    for (const series of listActiveTaskSeries(database)) {
      const today = localClock(instant, series.timezone).date
      const targetDate = throughLocalDate ?? shiftCalendarDate(today, 42)
      const fromDate =
        series.materializedThroughDate === null
          ? series.startDate
          : shiftCalendarDate(series.materializedThroughDate, 1)
      if (targetDate < fromDate) continue
      const toDate = [targetDate, shiftCalendarDate(fromDate, 365)].sort()[0] ?? targetDate
      database.exec("SAVEPOINT recurrence_series_materialization")
      try {
        createdCount += materializeSeries(database, series, { fromDate, toDate }, instant)
        recordSeriesMaterialization(database, series.id, toDate, null)
        database.exec("RELEASE SAVEPOINT recurrence_series_materialization")
      } catch (error) {
        database.exec("ROLLBACK TO SAVEPOINT recurrence_series_materialization")
        database.exec("RELEASE SAVEPOINT recurrence_series_materialization")
        if (!(error instanceof RecurrenceLocalTimeError)) throw error
        recordSeriesMaterialization(database, series.id, fromDate, {
          reason: error.reason,
          localDate: error.localDate,
          localTime: error.localTime,
          timezone: error.timezone,
          occurredAt: instant.toISOString(),
        })
      }
    }
    return createdCount
  })
}

export function replenishRecurrenceAfterItemMutation(
  database: DatabaseSync,
  itemId: string,
  instant: Date,
): number {
  const occurrence = getOccurrenceByItem(database, itemId)
  if (occurrence === null) return 0
  if (getItem(database, itemId, occurrence.occurrenceDate).status !== "completed") return 0
  const series = getTaskSeries(database, occurrence.seriesId)
  const nextDate = nextOccurrenceDate(series.rule, series.startDate, occurrence.occurrenceDate)
  if (nextDate === null) return 0
  return materializeTaskSeries(
    database,
    occurrence.seriesId,
    { fromDate: nextDate, toDate: nextDate },
    instant,
  )
}
