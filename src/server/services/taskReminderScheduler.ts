import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { ensureEvent } from "./schedulerEvents.js"

const ruleRowSchema = z.object({
  id: z.string(),
  item_id: z.string(),
  anchor: z.enum(["due", "scheduled"]),
  offset_minutes: z.number().int(),
  version: z.number().int(),
  due_at: z.string().nullable(),
  scheduled_start_at: z.string().nullable(),
})
const reminderSchema = z.object({ id: z.string() }).optional()

export function materializeTaskReminders(database: DatabaseSync, now: Date): void {
  database.prepare("UPDATE reminders SET enabled = 0 WHERE kind = 'deadline'").run()
  const rules = database
    .prepare(`SELECT r.id,r.item_id,r.anchor,r.offset_minutes,r.version,
    i.due_at,i.scheduled_start_at FROM task_reminder_rules r JOIN items i ON i.id=r.item_id
    WHERE i.status='active' AND i.deleted_at IS NULL AND r.enabled=1
    UNION ALL SELECT 'legacy-due:' || i.id,i.id,'due',i.reminder_minutes,1,i.due_at,i.scheduled_start_at
    FROM items i WHERE i.status='active' AND i.deleted_at IS NULL AND i.reminder_minutes IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM task_reminder_rules r WHERE r.item_id=i.id)`)
    .all()
    .map((row) => ruleRowSchema.parse(row))
  for (const rule of rules) {
    const anchor = rule.anchor === "due" ? rule.due_at : rule.scheduled_start_at
    if (anchor === null) continue
    const instant = new Date(Date.parse(anchor) - rule.offset_minutes * 60_000)
    if (!Number.isFinite(instant.getTime())) continue
    const scheduledAt = instant.toISOString()
    let reminder = reminderSchema.parse(
      database
        .prepare(`SELECT id FROM reminders
      WHERE task_rule_id=? AND task_rule_version=? AND scheduled_at=?`)
        .get(rule.id, rule.version, scheduledAt),
    )
    if (reminder === undefined && rule.anchor === "due") {
      reminder = reminderSchema.parse(
        database
          .prepare(`SELECT id FROM reminders WHERE kind='deadline'
        AND entity_id=? AND scheduled_at=? AND task_rule_id IS NULL LIMIT 1`)
          .get(rule.item_id, scheduledAt),
      )
      if (reminder !== undefined)
        database
          .prepare("UPDATE reminders SET task_rule_id=?,task_rule_version=? WHERE id=?")
          .run(rule.id, rule.version, reminder.id)
    }
    if (reminder === undefined) {
      if (instant > now) continue
      const id = crypto.randomUUID()
      database
        .prepare(`INSERT INTO reminders
        (id,kind,entity_id,scheduled_at,enabled,created_at,updated_at,task_rule_id,task_rule_version)
        VALUES (?,'deadline',?,?,1,?,?,?,?)`)
        .run(
          id,
          rule.item_id,
          scheduledAt,
          now.toISOString(),
          now.toISOString(),
          rule.id,
          rule.version,
        )
      reminder = { id }
    } else database.prepare("UPDATE reminders SET enabled=1 WHERE id=?").run(reminder.id)
    if (instant <= now) ensureEvent(database, reminder.id, "deadline", scheduledAt)
  }
}
