import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getTaskSeries } from "../../src/server/repositories/taskSeries.js"
import { moveToTrash, purgeTrash, restoreTrash } from "../../src/server/repositories/trash.js"
import { createTaskSeries, materializeTaskSeries } from "../../src/server/services/recurrence.js"
import { materializeRecurringTasks } from "../../src/server/services/recurrenceMaterializer.js"
import { runScheduler } from "../../src/server/services/scheduler.js"

let directory: string | null = null
afterEach(() => {
  if (directory !== null) rmSync(directory, { recursive: true, force: true })
  directory = null
})

describe("recurrence relation lifetime", () => {
  it("preserves soft-deleted relations and filters hard-purged relations without blocking scheduler", () => {
    // Given
    directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-lifetime-"))
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const now = "2026-09-10T04:00:00.000Z"
    const categoryId = crypto.randomUUID()
    const projectId = crypto.randomUUID()
    database
      .prepare(
        "INSERT INTO categories (id,name,color,icon,created_at,updated_at) VALUES (?,'客户','#123456','tag',?,?)",
      )
      .run(categoryId, now, now)
    database
      .prepare(
        "INSERT INTO projects (id,name,desired_outcome,created_at,updated_at) VALUES (?,'方案','提交方案',?,?)",
      )
      .run(projectId, now, now)
    const series = createTaskSeries(
      database,
      {
        requestId: crypto.randomUUID(),
        title: "检查客户反馈",
        categoryIds: [categoryId],
        projectIds: [projectId],
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 1 },
        dueTime: "17:00",
        reminders: [{ anchor: "due", offsetMinutes: 0 }],
      },
      "2026-09-10",
      new Date(now),
    )
    moveToTrash(database, "category", categoryId, "客户", new Date(now))
    const categoryTrash = database
      .prepare("SELECT id FROM trash_entries WHERE entity_type='category'")
      .get() as { id: string }

    // When
    materializeTaskSeries(
      database,
      series.id,
      { fromDate: "2026-10-23", toDate: "2026-10-23" },
      new Date("2026-10-23T10:00:00.000Z"),
    )
    const softDeletedRelation = database
      .prepare(`SELECT item_categories.category_id FROM item_categories
        JOIN task_occurrences ON task_occurrences.item_id=item_categories.item_id
        WHERE task_occurrences.series_id=? AND task_occurrences.occurrence_date='2026-10-23'`)
      .get(series.id)
    restoreTrash(database, categoryTrash.id)
    moveToTrash(database, "category", categoryId, "客户", new Date(now))
    moveToTrash(database, "project", projectId, "方案", new Date(now))
    const purgeIds = z
      .array(z.object({ id: z.string().uuid() }))
      .parse(database.prepare("SELECT id FROM trash_entries ORDER BY entity_type").all())
    purgeIds.forEach((entry) => {
      purgeTrash(database, entry.id)
    })
    runScheduler(database, new Date("2026-10-24T10:00:00.000Z"), { deferAiReview: true })

    // Then
    expect(softDeletedRelation).toEqual({ category_id: categoryId })
    const generated = database
      .prepare(`SELECT task_occurrences.item_id FROM task_occurrences
        WHERE series_id=? AND occurrence_date='2026-10-24'`)
      .get(series.id) as { item_id: string }
    expect(
      database.prepare("SELECT * FROM item_categories WHERE item_id=?").all(generated.item_id),
    ).toEqual([])
    expect(
      database.prepare("SELECT * FROM item_projects WHERE item_id=?").all(generated.item_id),
    ).toEqual([])
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS count FROM notification_events WHERE kind='deadline'")
          .get() as {
          count: number
        }
      ).count,
    ).toBeGreaterThan(0)
    expect(database.prepare("SELECT last_run_at FROM scheduler_state WHERE id=1").get()).toEqual({
      last_run_at: "2026-10-24T10:00:00.000Z",
    })
    database.close()
  })

  it("inherits the legacy scalar reminder when no reminder array was stored", () => {
    // Given
    directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-legacy-reminder-"))
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)

    // When
    createTaskSeries(
      database,
      {
        requestId: crypto.randomUUID(),
        title: "旧版提醒",
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 30 },
        dueTime: "17:00",
        reminderMinutes: 15,
      },
      "2026-09-10",
      new Date("2026-09-10T04:00:00.000Z"),
    )

    // Then
    expect(database.prepare("SELECT offset_minutes FROM task_reminder_rules").all()).toEqual([
      { offset_minutes: 15 },
      { offset_minutes: 15 },
    ])
    database.close()
  })

  it("advances a bounded persisted cursor while catching up after a long offline period", () => {
    // Given
    directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-catch-up-"))
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const series = createTaskSeries(
      database,
      {
        requestId: crypto.randomUUID(),
        title: "离线补齐",
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 30 },
      },
      "2026-09-10",
      new Date("2026-09-10T04:00:00.000Z"),
    )

    // When
    materializeRecurringTasks(database, new Date("2028-01-01T04:00:00.000Z"))
    const firstCursor = getTaskSeries(database, series.id).materializedThroughDate
    materializeRecurringTasks(database, new Date("2028-01-01T04:00:00.000Z"))

    // Then
    expect(firstCursor).toBe("2027-10-23")
    expect(getTaskSeries(database, series.id).materializedThroughDate).toBe("2028-02-12")
    database.close()
  })

  it("records one future DST failure while allowing the scheduler to finish other work", () => {
    // Given
    directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-dst-isolation-"))
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const failing = createTaskSeries(
      database,
      {
        requestId: crypto.randomUUID(),
        title: "DST 边界",
        timezone: "America/New_York",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 1 },
        dueTime: "02:30",
      },
      "2026-09-10",
      new Date("2026-09-10T04:00:00.000Z"),
    )
    createTaskSeries(
      database,
      {
        requestId: crypto.randomUUID(),
        title: "安全系列",
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 30 },
        dueTime: "17:00",
        reminders: [{ anchor: "due", offsetMinutes: 0 }],
      },
      "2026-09-10",
      new Date("2026-09-10T04:00:00.000Z"),
    )

    // When
    runScheduler(database, new Date("2027-03-15T10:00:00.000Z"), { deferAiReview: true })

    // Then
    expect(getTaskSeries(database, failing.id).materializationError).toEqual(
      expect.objectContaining({ reason: "nonexistent", localDate: "2027-03-14" }),
    )
    expect(database.prepare("SELECT last_run_at FROM scheduler_state WHERE id=1").get()).toEqual({
      last_run_at: "2027-03-15T10:00:00.000Z",
    })
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS count FROM notification_events WHERE kind='deadline'")
          .get() as {
          count: number
        }
      ).count,
    ).toBeGreaterThan(0)
    database.close()
  })
})
