import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { generateLocalReview } from "../repositories/reviews.js"
import { getSettings } from "../repositories/settings.js"
import { materializeRecurringTasks } from "./recurrenceMaterializer.js"
import { ensureEvent, ensureReminder } from "./schedulerEvents.js"
import { materializeTaskReminders } from "./taskReminderScheduler.js"
import { localClock, localDateTimeToInstant, shiftCalendarDate } from "./time.js"

const schedulerStateRowSchema = z.object({ last_run_at: z.string().nullable() })
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

function readOnboardingCompletedAt(database: DatabaseSync): string | null {
  const row = z
    .object({ onboarding_completed_at: z.string().nullable() })
    .parse(
      database.prepare("SELECT onboarding_completed_at FROM workspace_settings WHERE id = 1").get(),
    )
  return row.onboarding_completed_at
}

export function dismissWeeklyReviewsBeforeOnboarding(database: DatabaseSync, now: Date): void {
  const onboardedAt = readOnboardingCompletedAt(database)
  if (onboardedAt === null) return
  database
    .prepare(
      `UPDATE notification_events
       SET dismissed_at = COALESCE(dismissed_at, ?)
       WHERE kind = 'weekly_review'
         AND dismissed_at IS NULL
         AND scheduled_at <= ?`,
    )
    .run(now.toISOString(), onboardedAt)
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
  const onboardedAt = readOnboardingCompletedAt(database)
  if (onboardedAt !== null && scheduledAt.getTime() <= new Date(onboardedAt).getTime()) return
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
    materializeRecurringTasks(database, now)
    materializeTaskReminders(database, now)
    database
      .prepare("UPDATE scheduler_state SET last_run_at = ? WHERE id = 1")
      .run(now.toISOString())
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

export {
  dismissNotification,
  listDueNotifications,
  snoozeNotification,
} from "./schedulerNotifications.js"
