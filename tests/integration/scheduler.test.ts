import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { completeOnboarding } from "../../src/server/services/onboarding.js"
import { listDueNotifications, snoozeNotification } from "../../src/server/services/scheduler.js"

const directories: string[] = []

afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { force: true, recursive: true })
  })
})

function createDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-scheduler-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  return database
}

describe("reminder scheduler", () => {
  it("materializes daily reminders missed while the app was closed", () => {
    const database = createDatabase()
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00', evening_reminder_time = '21:00'",
      )
      .run()

    listDueNotifications(database, new Date("2026-08-04T02:00:00.000Z"))
    const dueAfterRestart = listDueNotifications(database, new Date("2026-08-05T02:00:00.000Z"))

    expect(dueAfterRestart).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "evening",
          scheduledAt: "2026-08-04T13:00:00.000Z",
        }),
        expect.objectContaining({
          kind: "morning",
          scheduledAt: "2026-08-05T01:00:00.000Z",
        }),
      ]),
    )
    database.close()
  })

  it("materializes missed reminders and persists snooze state", () => {
    const database = createDatabase()
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00'",
      )
      .run()

    const due = listDueNotifications(database, new Date("2026-08-04T02:00:00.000Z"))
    expect(due.some((notification) => notification.kind === "morning")).toBe(true)
    const morning = due.find((notification) => notification.kind === "morning")
    expect(morning).toBeDefined()
    if (morning === undefined) return

    snoozeNotification(database, morning.id, new Date("2026-08-04T02:30:00.000Z"))
    expect(listDueNotifications(database, new Date("2026-08-04T02:10:00.000Z"))).not.toContainEqual(
      expect.objectContaining({ id: morning.id }),
    )
    expect(listDueNotifications(database, new Date("2026-08-04T02:31:00.000Z"))).toContainEqual(
      expect.objectContaining({ id: morning.id }),
    )
    database.close()
  })

  it("creates a missed weekly review from items, habits, projects, feedback, and gains", () => {
    const database = createDatabase()
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', weekly_review_time = '20:00'",
      )
      .run()
    const now = "2026-08-02T13:00:00.000Z"
    database
      .prepare(
        "INSERT INTO items (id, title, status, completed_at, created_at, updated_at) VALUES ('item-1', '完成提案', 'completed', ?, ?, ?)",
      )
      .run(now, now, now)
    database
      .prepare(
        "INSERT INTO habits (id, name, type, target_count, created_at, updated_at) VALUES ('habit-1', '散步', 'check', 1, ?, ?)",
      )
      .run(now, now)
    database
      .prepare(
        "INSERT INTO habit_logs (id, habit_id, local_date, count, created_at, updated_at) VALUES ('log-1', 'habit-1', '2026-08-01', 1, ?, ?)",
      )
      .run(now, now)
    database
      .prepare(
        "INSERT INTO projects (id, name, desired_outcome, progress, created_at, updated_at) VALUES ('project-1', '迁居', '完成搬迁', 40, ?, ?)",
      )
      .run(now, now)
    database
      .prepare(
        "INSERT INTO project_feedback (id, project_id, obstacle, created_at) VALUES ('feedback-1', 'project-1', '等待确认', ?)",
      )
      .run(now)
    database
      .prepare(
        "INSERT INTO daily_gains (id, local_date, content, created_at, updated_at) VALUES ('gain-1', '2026-08-01', '节奏更稳了', ?, ?)",
      )
      .run(now, now)

    listDueNotifications(database, new Date(now))
    const review = z
      .object({ summary: z.string(), completed_json: z.string(), obstacles_json: z.string() })
      .optional()
      .parse(
        database
          .prepare("SELECT summary, completed_json, obstacles_json FROM weekly_reviews")
          .get(),
      )
    expect(review?.summary).toContain("习惯")
    expect(review?.completed_json).toContain("完成提案")
    expect(review?.completed_json).toContain("节奏更稳了")
    expect(review?.obstacles_json).toContain("等待确认")
    database.close()
  })

  it("does not catch up weekly review banners from before the workspace was onboarded", () => {
    const database = createDatabase()
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', weekly_review_time = '20:00'",
      )
      .run()
    completeOnboarding(database, {
      workspaceName: "新空间",
      aiNickname: "星伴",
      userName: "你",
      timezone: "Asia/Shanghai",
    })
    // Friday afternoon Asia/Shanghai — previous Sunday's weekly review would otherwise catch up.
    const due = listDueNotifications(database, new Date("2026-08-07T08:00:00.000Z"))
    expect(due.some((notification) => notification.kind === "weekly_review")).toBe(false)
    database.close()
  })

  it("hides already-materialized weekly reviews that predate onboarding", () => {
    const database = createDatabase()
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', weekly_review_time = '20:00'",
      )
      .run()
    const beforeOnboarding = listDueNotifications(database, new Date("2026-08-07T08:00:00.000Z"))
    expect(beforeOnboarding.some((notification) => notification.kind === "weekly_review")).toBe(
      true,
    )
    database
      .prepare(
        "UPDATE workspace_settings SET onboarding_completed = 1, onboarding_completed_at = ? WHERE id = 1",
      )
      .run("2026-08-07T08:00:00.000Z")
    const afterOnboarding = listDueNotifications(database, new Date("2026-08-07T08:05:00.000Z"))
    expect(afterOnboarding.some((notification) => notification.kind === "weekly_review")).toBe(
      false,
    )
    database.close()
  })
})
