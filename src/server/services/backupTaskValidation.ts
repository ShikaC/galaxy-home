import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { createItemInputSchema } from "../../shared/items.js"
import { createTaskSeriesInputSchema } from "../../shared/recurrence.js"
import {
  snoozeNotificationInputSchema,
  snoozeNotificationResultSchema,
} from "../../shared/reminders.js"
import { calendarDateSchema, reminderRuleInputSchema } from "../../shared/taskCore.js"
import { ImportArchiveMalformedError } from "./backupArchive.js"
import type { exportSchema } from "./backupSchema.js"

type ArchiveTables = z.infer<typeof exportSchema>["tables"]

export function validateTaskArchiveRows(tables: ArchiveTables): void {
  try {
    for (const row of tables["items"] ?? []) {
      const reminders = (tables["task_reminder_rules"] ?? [])
        .filter((rule) => rule["item_id"] === row["id"])
        .map((rule) =>
          reminderRuleInputSchema.parse({
            anchor: rule["anchor"],
            offsetMinutes: rule["offset_minutes"],
          }),
        )
      z.number().int().nonnegative().nullish().parse(row["reminder_minutes"])
      createItemInputSchema.parse({
        title: row["title"],
        notes: row["notes"] ?? undefined,
        dueAt: row["due_at"] ?? undefined,
        dueDate: row["due_date"] ?? undefined,
        priority: row["priority"] ?? undefined,
        parentId: row["parent_id"] ?? undefined,
        estimatedMinutes: row["estimated_minutes"] ?? undefined,
        scheduledStartAt: row["scheduled_start_at"] ?? undefined,
        scheduledEndAt: row["scheduled_end_at"] ?? undefined,
        scheduleTimezone: row["schedule_timezone"] ?? undefined,
        isFixed: row["is_fixed"] === 1,
        reminders,
      })
    }
    for (const row of tables["task_series"] ?? []) {
      const request = createTaskSeriesInputSchema.parse(
        JSON.parse(z.string().parse(row["create_request_json"])),
      )
      if (request.requestId !== row["id"]) throw new Error("Mismatched series create identity")
      createTaskSeriesInputSchema.parse({
        requestId: row["id"],
        title: row["title"],
        notes: row["notes"] ?? undefined,
        priority: row["priority"] ?? undefined,
        categoryIds: JSON.parse(z.string().parse(row["category_ids_json"] ?? "[]")),
        projectIds: JSON.parse(z.string().parse(row["project_ids_json"] ?? "[]")),
        timezone: row["timezone"],
        startDate: row["start_date"],
        rule: JSON.parse(z.string().parse(row["rule_json"])),
        estimatedMinutes: row["estimated_minutes"] ?? undefined,
        dueTime: row["due_time"] ?? undefined,
        reminderMinutes: row["reminder_minutes"] ?? undefined,
        reminders: JSON.parse(z.string().parse(row["reminder_rules_json"] ?? "[]")),
      })
    }
    for (const row of tables["notification_snooze_requests"] ?? []) {
      z.uuid().parse(row["request_id"])
      snoozeNotificationInputSchema.parse({ minutes: row["minutes"], requestId: row["request_id"] })
      snoozeNotificationResultSchema.parse({
        eventId: row["request_event_id"],
        scheduledAt: row["scheduled_at"],
      })
      if (row["event_id"] !== null && row["event_id"] !== row["request_event_id"])
        throw new Error("Mismatched snooze event identity")
    }
    for (const row of tables["item_create_requests"] ?? [])
      createItemInputSchema.parse(JSON.parse(z.string().parse(row["payload_json"])))
    for (const row of tables["task_occurrences"] ?? [])
      calendarDateSchema.parse(row["occurrence_date"])
  } catch (error) {
    throw new ImportArchiveMalformedError(error)
  }
}

export function verifyRestoredTasks(database: DatabaseSync): void {
  if (database.prepare("PRAGMA foreign_key_check").all().length > 0)
    throw new ImportArchiveMalformedError(new Error("Foreign key violations"))
  const rows = database
    .prepare("SELECT id, parent_id FROM items")
    .all()
    .map((row) => z.object({ id: z.string(), parent_id: z.string().nullable() }).parse(row))
  const parents = new Map(rows.map((row) => [row.id, row.parent_id]))
  for (const row of rows) {
    if (row.parent_id !== null && (parents.get(row.parent_id) ?? null) !== null)
      throw new ImportArchiveMalformedError(new Error("Task hierarchy exceeds one subtask level"))
  }
}
