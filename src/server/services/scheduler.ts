import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  type Notification,
  notificationKindSchema,
  notificationSchema,
} from "../../shared/reminders.js"
import { generateLocalReview } from "../repositories/reviews.js"
import { getSettings } from "../repositories/settings.js"
import { localClock, localDateTimeToInstant, shiftCalendarDate } from "./time.js"

const reminderRowSchema = z.object({ id: z.string().uuid() })
const eventRowSchema = z.object({ id: z.string().uuid() })
const schedulerStateRowSchema = z.object({ last_run_at: z.string().nullable() })
const dueRowSchema = z.object({
  id: z.string().uuid(),
  reminder_id: z.string().uuid(),
  kind: notificationKindSchema,
  scheduled_at: z.string(),
  entity_id: z.string().nullable(),
  item_title: z.string().nullable(),
  item_due_at: z.string().nullable(),
})

function ensureReminder(
  database: DatabaseSync,
  kind: z.infer<typeof notificationKindSchema>,
  entityId: string,
  scheduledAt: string,
): string {
  const existing = reminderRowSchema
    .optional()
    .parse(
      database
        .prepare("SELECT id FROM reminders WHERE kind = ? AND entity_id = ? AND scheduled_at = ?")
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

function ensureEvent(
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

function materializeDailyReminders(
  database: DatabaseSync,
  now: Date,
  lastRunAt: string | null,
): void {
  const settings = getSettings(database)
  const clock = localClock(now, settings.timezone)
  const daily = [
    {
      kind: "morning" as const,
      enabled: settings.morningReminderEnabled,
      time: settings.morningReminderTime,
    },
    {
      kind: "evening" as const,
      enabled: settings.eveningReminderEnabled,
      time: settings.eveningReminderTime,
    },
  ]
  const lastDate =
    lastRunAt === null ? clock.date : localClock(new Date(lastRunAt), settings.timezone).date
  const firstDate = lastDate > clock.date ? clock.date : lastDate
  let date = firstDate
  while (true) {
    for (const reminder of daily) {
      if (!reminder.enabled) continue
      const scheduledAt = localDateTimeToInstant(date, reminder.time, settings.timezone)
      if (scheduledAt > now) continue
      const id = ensureReminder(database, reminder.kind, date, scheduledAt.toISOString())
      ensureEvent(database, id, reminder.kind, scheduledAt.toISOString())
    }
    if (date === clock.date) break
    date = shiftCalendarDate(date, 1)
  }
}

function latestDueReviewSunday(now: Date, timezone: string, reviewTime: string): string {
  const clock = localClock(now, timezone)
  const beforeTodayTrigger = clock.weekday === 0 && clock.time < reviewTime
  const daysBack = clock.weekday + (beforeTodayTrigger ? 7 : 0)
  return shiftCalendarDate(clock.date, -daysBack)
}

function materializeWeeklyReview(
  database: DatabaseSync,
  now: Date,
  options: { readonly deferAiReview: boolean } = { deferAiReview: false },
): void {
  const settings = getSettings(database)
  if (!settings.weeklyReviewEnabled) return
  const sunday = latestDueReviewSunday(now, settings.timezone, settings.weeklyReviewTime)
  const weekStart = shiftCalendarDate(sunday, -6)
  const scheduledAt = localDateTimeToInstant(sunday, settings.weeklyReviewTime, settings.timezone)
  if (scheduledAt > now) return
  const reviewExists = z
    .object({ value: z.number() })
    .parse(
      database
        .prepare(
          "SELECT COUNT(*) AS value FROM weekly_reviews WHERE week_start = ? AND deleted_at IS NULL",
        )
        .get(weekStart),
    ).value
  if (reviewExists === 0 && !options.deferAiReview)
    generateLocalReview(database, weekStart, sunday, settings.timezone)
  const id = ensureReminder(database, "weekly_review", weekStart, scheduledAt.toISOString())
  ensureEvent(database, id, "weekly_review", scheduledAt.toISOString())
}

export function dueWeeklyReviewWindow(database: DatabaseSync, now = new Date()) {
  const settings = getSettings(database)
  if (!settings.weeklyReviewEnabled) return null
  const sunday = latestDueReviewSunday(now, settings.timezone, settings.weeklyReviewTime)
  const weekStart = shiftCalendarDate(sunday, -6)
  const scheduledAt = localDateTimeToInstant(sunday, settings.weeklyReviewTime, settings.timezone)
  if (scheduledAt > now) return null
  return { weekStart, weekEnd: sunday }
}

function materializeDeadlines(database: DatabaseSync, now: Date): void {
  const rows = database
    .prepare(
      `SELECT id, due_at, reminder_minutes FROM items
       WHERE status = 'active' AND deleted_at IS NULL AND due_at IS NOT NULL
         AND reminder_minutes IS NOT NULL`,
    )
    .all()
    .map((row) =>
      z
        .object({ id: z.string(), due_at: z.string(), reminder_minutes: z.number().int() })
        .parse(row),
    )
  for (const row of rows) {
    const scheduledAt = new Date(new Date(row.due_at).getTime() - row.reminder_minutes * 60_000)
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt > now) continue
    const id = ensureReminder(database, "deadline", row.id, scheduledAt.toISOString())
    ensureEvent(database, id, "deadline", scheduledAt.toISOString())
  }
}

export function runScheduler(
  database: DatabaseSync,
  now = new Date(),
  options: { readonly deferAiReview?: boolean } = {},
): void {
  database.exec("BEGIN IMMEDIATE")
  try {
    database.prepare("DELETE FROM notification_events WHERE scheduled_at NOT LIKE '%Z'").run()
    database.prepare("DELETE FROM reminders WHERE scheduled_at NOT LIKE '%Z'").run()
    const schedulerState = schedulerStateRowSchema.parse(
      database.prepare("SELECT last_run_at FROM scheduler_state WHERE id = 1").get(),
    )
    materializeDailyReminders(database, now, schedulerState.last_run_at)
    materializeWeeklyReview(database, now, {
      deferAiReview: options.deferAiReview === true,
    })
    materializeDeadlines(database, now)
    database
      .prepare("UPDATE scheduler_state SET last_run_at = ? WHERE id = 1")
      .run(now.toISOString())
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

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
    return { title: `待办提醒：${row.item_title ?? "未命名待办"}`, detail: `截止时间 ${due}` }
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
  if (focus !== undefined) {
    return {
      title: "今日重点已就位",
      detail: `专注推进「${focus.title}」即可，不必再另找一件。`,
    }
  }
  const primaryCount = z
    .object({ count: z.number().int() })
    .parse(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM today_items
           JOIN items ON items.id = today_items.item_id
           WHERE today_items.local_date = ? AND today_items.is_secondary = 0
             AND items.status = 'active' AND items.deleted_at IS NULL`,
        )
        .get(localDate),
    ).count
  if (primaryCount > 0) {
    return {
      title: "今天的主要待办已安排",
      detail: "从首页挑一件推进即可；想换重点时可在待办里重新设置。",
    }
  }
  return { title: "今天最想推进什么？", detail: "从收集箱选择一件，或保留一个足够小的今日重点。" }
}

export function listDueNotifications(
  database: DatabaseSync,
  now = new Date(),
): readonly Notification[] {
  runScheduler(database, now)
  const timezone = getSettings(database).timezone
  const rows = database
    .prepare(
      `SELECT notification_events.id, notification_events.reminder_id, notification_events.kind,
         notification_events.scheduled_at, reminders.entity_id, items.title AS item_title,
         items.due_at AS item_due_at
       FROM notification_events
       JOIN reminders ON reminders.id = notification_events.reminder_id
       LEFT JOIN items ON items.id = reminders.entity_id AND reminders.kind = 'deadline'
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
    .object({ reminder_id: z.string().uuid() })
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
