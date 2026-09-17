import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { notificationKindSchema } from "../../shared/reminders.js"

const reminderRowSchema = z.object({ id: z.uuid() })
const eventRowSchema = z.object({ id: z.uuid() })
export function ensureReminder(
  database: DatabaseSync,
  kind: z.infer<typeof notificationKindSchema>,
  entityId: string,
  scheduledAt: string,
): string {
  const existing = reminderRowSchema
    .optional()
    .parse(
      database
        .prepare(
          "SELECT id FROM reminders WHERE kind = ? AND entity_id = ? AND (kind IN ('morning', 'evening') OR scheduled_at = ?)",
        )
        .get(kind, entityId, scheduledAt),
    )
  if (existing !== undefined) return existing.id
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO reminders
       (id, kind, entity_id, scheduled_at, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(id, kind, entityId, scheduledAt, now, now)
  return id
}

export function ensureEvent(
  database: DatabaseSync,
  reminderId: string,
  kind: string,
  scheduledAt: string,
) {
  const existing = eventRowSchema
    .optional()
    .parse(
      database.prepare("SELECT id FROM notification_events WHERE reminder_id = ?").get(reminderId),
    )
  if (existing !== undefined) return
  database
    .prepare(
      `INSERT INTO notification_events (id, reminder_id, kind, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(crypto.randomUUID(), reminderId, kind, scheduledAt, new Date().toISOString())
}
