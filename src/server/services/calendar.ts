import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  type CalendarItem,
  type CalendarQuery,
  type CalendarSnapshot,
  calendarItemSchema,
  calendarQuerySchema,
  calendarSnapshotSchema,
  defaultWorkWindow,
} from "../../shared/calendar.js"
import { scheduleConflicts } from "./calendarConflicts.js"
import { freeSlots, intervalFor, overlaps, rangeInstants } from "./calendarIntervals.js"

export { validateScheduleChanges } from "./calendarValidation.js"

const rowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(["active", "completed", "archived"]),
  version: z.number().int(),
  due_at: z.string().nullable(),
  due_date: z.string().nullable(),
  estimated_minutes: z.number().int().nullable(),
  scheduled_start_at: z.string().nullable(),
  scheduled_end_at: z.string().nullable(),
  schedule_timezone: z.string().nullable(),
  is_fixed: z.number().int(),
  series_id: z.string().nullable(),
  occurrence_date: z.string().nullable(),
})
const assignmentSchema = z.object({ item_id: z.uuid(), local_date: z.string() })

function fingerprint(items: readonly CalendarItem[], query: CalendarQuery): string {
  const stable = [...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => [
      item.id,
      item.version,
      item.status,
      item.dueAt,
      item.dueDate,
      item.estimatedMinutes,
      item.scheduledStartAt,
      item.scheduledEndAt,
      item.scheduleTimezone,
      item.isFixed,
      item.recurrenceSeriesId,
      item.recurrenceDate,
      [...item.dateAssignments].sort(),
    ])
  return createHash("sha256")
    .update(
      JSON.stringify({
        startDate: query.startDate,
        endDate: query.endDate,
        timezone: query.timezone,
        workWindow: query.workWindow ?? defaultWorkWindow,
        items: stable,
      }),
    )
    .digest("hex")
}

export function buildCalendarSnapshotFromItems(
  sourceItems: readonly CalendarItem[],
  rawQuery: CalendarQuery,
): CalendarSnapshot {
  const query = calendarQuerySchema.parse(rawQuery)
  const range = rangeInstants(query)
  const items = sourceItems
    .map((item) => calendarItemSchema.parse(item))
    .filter((item) => {
      if (item.status === "archived") return false
      const interval = intervalFor(item)
      if (interval !== null && overlaps(interval, range)) return true
      if (
        item.recurrenceDate != null &&
        (item.recurrenceDate < query.startDate || item.recurrenceDate >= query.endDate)
      )
        return false
      return (
        interval === null ||
        item.dateAssignments.some((date) => date >= query.startDate && date < query.endDate) ||
        (item.dueDate !== null &&
          item.dueDate >= query.startDate &&
          item.dueDate < query.endDate) ||
        (item.dueAt !== null &&
          Date.parse(item.dueAt) >= range.start &&
          Date.parse(item.dueAt) < range.end)
      )
    })
  const scheduled = items.filter((item) => {
    const interval = intervalFor(item)
    return interval !== null && overlaps(interval, range)
  })
  const result = {
    startDate: query.startDate,
    endDate: query.endDate,
    timezone: query.timezone,
    workWindow: query.workWindow ?? defaultWorkWindow,
    items,
    scheduled,
    allDay: items.filter((item) =>
      item.dateAssignments.some((date) => date >= query.startDate && date < query.endDate),
    ),
    unscheduled: items.filter((item) => item.status === "active" && intervalFor(item) === null),
    deadlines: items.filter(
      (item) =>
        (item.dueDate !== null &&
          item.dueDate >= query.startDate &&
          item.dueDate < query.endDate) ||
        (item.dueAt !== null &&
          Date.parse(item.dueAt) >= rangeInstants(query).start &&
          Date.parse(item.dueAt) < rangeInstants(query).end),
    ),
    freeSlots: freeSlots(items, query),
    conflicts: scheduleConflicts(items, query),
    fingerprint: fingerprint(items, query),
  }
  return calendarSnapshotSchema.parse(result)
}

export function buildCalendarSnapshot(
  database: DatabaseSync,
  rawQuery: CalendarQuery,
): CalendarSnapshot {
  const query = calendarQuerySchema.parse(rawQuery)
  const rows = database
    .prepare(
      `SELECT i.id,i.title,i.status,i.version,i.due_at,i.due_date,i.estimated_minutes,i.scheduled_start_at,i.scheduled_end_at,i.schedule_timezone,i.is_fixed,o.series_id,o.occurrence_date FROM items i LEFT JOIN task_occurrences o ON o.item_id=i.id WHERE i.deleted_at IS NULL AND i.status != 'archived' AND (o.status IS NULL OR o.status != 'skipped') ORDER BY i.created_at,i.id`,
    )
    .all()
    .map((row) => rowSchema.parse(row))
  const assignments = database
    .prepare(
      "SELECT item_id,local_date FROM today_items WHERE local_date >= ? AND local_date < ? ORDER BY local_date,item_id",
    )
    .all(query.startDate, query.endDate)
    .map((row) => assignmentSchema.parse(row))
  return buildCalendarSnapshotFromItems(
    rows.map((row) =>
      calendarItemSchema.parse({
        id: row.id,
        title: row.title,
        status: row.status,
        version: row.version,
        dueAt: row.due_at,
        dueDate: row.due_date,
        estimatedMinutes: row.estimated_minutes,
        scheduledStartAt: row.scheduled_start_at,
        scheduledEndAt: row.scheduled_end_at,
        scheduleTimezone: row.schedule_timezone,
        isFixed: row.is_fixed === 1,
        recurrenceSeriesId: row.series_id,
        recurrenceDate: row.occurrence_date,
        dateAssignments: assignments
          .filter((entry) => entry.item_id === row.id)
          .map((entry) => entry.local_date),
      }),
    ),
    query,
  )
}
