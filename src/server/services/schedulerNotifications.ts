import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { morningReminderCopy } from "../../shared/morningReminder.js"
import {
  type Notification,
  notificationKindSchema,
  notificationSchema,
} from "../../shared/reminders.js"
import { getSettings } from "../repositories/settings.js"
import { dismissWeeklyReviewsBeforeOnboarding, runScheduler } from "./scheduler.js"
import { localClock } from "./time.js"

const dueRowSchema = z.object({
  id: z.uuid(),
  reminder_id: z.uuid(),
  kind: notificationKindSchema,
  scheduled_at: z.string(),
  entity_id: z.string().nullable(),
  item_title: z.string().nullable(),
  item_due_at: z.string().nullable(),
  reminder_anchor: z.enum(["due", "scheduled"]).nullable(),
})

function notificationCopy(
  database: DatabaseSync,
  row: z.infer<typeof dueRowSchema>,
  timezone: string,
  now: Date,
) {
  if (row.kind === "deadline") {
    const due =
      row.item_due_at === null
        ? ""
        : new Intl.DateTimeFormat("zh-CN", {
            timeZone: timezone,
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(row.item_due_at))
    return {
      title: `待办提醒：${row.item_title ?? "未命名待办"}`,
      detail: `${row.reminder_anchor === "scheduled" ? "安排开始" : "截止时间"} ${due}`,
    }
  }
  if (row.kind === "weekly_review")
    return { title: "本周可以轻轻收尾了", detail: "回顾已汇总完成、习惯、项目与收获。" }
  if (row.kind === "evening")
    return { title: "今天有什么值得留下？", detail: "写下一条收获就好，不必总结完整的一天。" }
  const localDate = localClock(now, timezone).date
  const focus = z
    .object({ title: z.string() })
    .optional()
    .parse(
      database
        .prepare(
          `SELECT items.title AS title FROM today_items
           JOIN items ON items.id = today_items.item_id
           WHERE today_items.local_date = ? AND today_items.is_focus = 1
             AND items.status = 'active' AND items.deleted_at IS NULL
           LIMIT 1`,
        )
        .get(localDate),
    )
  const primaryCount = z.object({ count: z.number().int() }).parse(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM today_items
           JOIN items ON items.id = today_items.item_id
           WHERE today_items.local_date = ? AND today_items.is_secondary = 0
             AND items.status = 'active' AND items.deleted_at IS NULL`,
      )
      .get(localDate),
  ).count
  const inboxCount = z.object({ count: z.number().int() }).parse(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM items
         WHERE status = 'active' AND deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM item_categories WHERE item_id = items.id)
           AND NOT EXISTS (SELECT 1 FROM item_projects WHERE item_id = items.id)`,
      )
      .get(),
  ).count
  const completedTodayCount = z.object({ count: z.number().int() }).parse(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM today_items
           JOIN items ON items.id = today_items.item_id
           WHERE today_items.local_date = ? AND items.status = 'completed'
             AND items.deleted_at IS NULL`,
      )
      .get(localDate),
  ).count
  return morningReminderCopy({
    completedTodayCount,
    focusTitle: focus?.title ?? null,
    inboxCount,
    primaryCount,
  })
}

export function listDueNotifications(
  database: DatabaseSync,
  now = new Date(),
): readonly Notification[] {
  runScheduler(database, now)
  dismissWeeklyReviewsBeforeOnboarding(database, now)
  const timezone = getSettings(database).timezone
  const rows = database
    .prepare(
      `SELECT notification_events.id, notification_events.reminder_id, notification_events.kind,
         notification_events.scheduled_at, reminders.entity_id, items.title AS item_title,
         CASE WHEN rules.anchor = 'scheduled' THEN items.scheduled_start_at ELSE items.due_at END AS item_due_at, rules.anchor AS reminder_anchor
       FROM notification_events
       JOIN reminders ON reminders.id = notification_events.reminder_id
       LEFT JOIN items ON items.id = reminders.entity_id AND reminders.kind = 'deadline'
       LEFT JOIN task_reminder_rules rules ON rules.id = reminders.task_rule_id
       WHERE notification_events.dismissed_at IS NULL AND notification_events.scheduled_at <= ?
         AND reminders.enabled = 1
       ORDER BY notification_events.scheduled_at LIMIT 10`,
    )
    .all(now.toISOString())
    .map((row) => dueRowSchema.parse(row))
  const deliveredAt = now.toISOString()
  const markDelivered = database.prepare(
    "UPDATE notification_events SET delivered_at = COALESCE(delivered_at, ?) WHERE id = ?",
  )
  return rows.map((row) => {
    markDelivered.run(deliveredAt, row.id)
    return notificationSchema.parse({
      id: row.id,
      reminderId: row.reminder_id,
      kind: row.kind,
      ...notificationCopy(database, row, timezone, now),
      scheduledAt: row.scheduled_at,
      entityId: row.entity_id,
    })
  })
}

export function snoozeNotification(
  database: DatabaseSync,
  id: string,
  until: Date,
  now = new Date(),
): void {
  const event = z
    .object({ reminder_id: z.uuid() })
    .parse(database.prepare("SELECT reminder_id FROM notification_events WHERE id = ?").get(id))
  const updatedAt = now.toISOString()
  database
    .prepare("UPDATE notification_events SET scheduled_at = ?, delivered_at = NULL WHERE id = ?")
    .run(until.toISOString(), id)
  database
    .prepare("UPDATE reminders SET snoozed_until = ?, updated_at = ? WHERE id = ?")
    .run(until.toISOString(), updatedAt, event.reminder_id)
}

export function dismissNotification(database: DatabaseSync, id: string, now = new Date()): void {
  database
    .prepare("UPDATE notification_events SET dismissed_at = ? WHERE id = ?")
    .run(now.toISOString(), id)
}
