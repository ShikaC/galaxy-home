import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"

const columnSchema = z.object({ name: z.string() })
const tableSchema = z.object({ name: z.string() })

let database: DatabaseSync
let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-core-schema-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { force: true, recursive: true })
})

describe("task and time core migration", () => {
  it("adds task fields and durable recurrence and reminder stores", () => {
    // Given
    const expectedItemColumns = [
      "version",
      "priority",
      "parent_id",
      "due_date",
      "estimated_minutes",
      "scheduled_start_at",
      "scheduled_end_at",
      "schedule_timezone",
      "is_fixed",
    ]

    // When
    const itemColumns = database
      .prepare("PRAGMA table_info(items)")
      .all()
      .map((row) => columnSchema.parse(row).name)
    const seriesColumns = database
      .prepare("PRAGMA table_info(task_series)")
      .all()
      .map((row) => columnSchema.parse(row).name)
    const newTables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('item_create_requests', 'notification_snooze_requests', 'task_series', 'task_occurrences', 'task_reminder_rules', 'task_plan_runs') ORDER BY name",
      )
      .all()
      .map((row) => tableSchema.parse(row).name)

    // Then
    expect(itemColumns).toEqual(expect.arrayContaining(expectedItemColumns))
    expect(newTables).toEqual([
      "item_create_requests",
      "notification_snooze_requests",
      "task_occurrences",
      "task_plan_runs",
      "task_reminder_rules",
      "task_series",
    ])
    expect(seriesColumns).toEqual(
      expect.arrayContaining(["materialized_through_date", "materialization_error_json"]),
    )
  })

  it("increments a task version for legacy scalar and relation writes", () => {
    // Given
    const itemId = crypto.randomUUID()
    const categoryId = crypto.randomUUID()
    const now = new Date("2026-09-10T08:00:00.000Z").toISOString()
    database
      .prepare("INSERT INTO items (id, title, created_at, updated_at) VALUES (?, '初始', ?, ?)")
      .run(itemId, now, now)
    database
      .prepare(
        "INSERT INTO categories (id, name, color, icon, created_at, updated_at) VALUES (?, '工作', '#000000', 'briefcase', ?, ?)",
      )
      .run(categoryId, now, now)

    // When
    database.prepare("UPDATE items SET title = '旧入口更新' WHERE id = ?").run(itemId)
    database
      .prepare("INSERT INTO item_categories (item_id, category_id) VALUES (?, ?)")
      .run(itemId, categoryId)

    // Then
    expect(database.prepare("SELECT version FROM items WHERE id = ?").get(itemId)).toEqual({
      version: 3,
    })
  })
})
