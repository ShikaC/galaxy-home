import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getItem } from "../../src/server/repositories/items.js"
import {
  createTaskSeries,
  materializeTaskSeries,
  RecurrenceRequestConflictError,
  skipOccurrence,
  updateTaskSeries,
} from "../../src/server/services/recurrence.js"

const directories: string[] = []
let database: DatabaseSync
const instant = new Date("2026-09-10T04:00:00.000Z")

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-"))
  directories.push(directory)
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})

afterEach(() => {
  database.close()
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true })
  })
})

function weekdaySeries(requestId = crypto.randomUUID()) {
  return {
    requestId,
    title: "检查客户反馈",
    priority: "medium" as const,
    categoryIds: [],
    projectIds: [],
    timezone: "Asia/Shanghai",
    startDate: "2026-09-10",
    rule: { frequency: "weekly" as const, interval: 1, weekdays: [1, 2, 3, 4, 5] },
    estimatedMinutes: 30,
    dueTime: "17:00",
    reminders: [
      { anchor: "due" as const, offsetMinutes: 10 },
      { anchor: "due" as const, offsetMinutes: 30 },
    ],
  }
}

describe("recurrence persistence", () => {
  it("returns one stable series and stable items when create is retried after reopening", () => {
    // Given
    const input = weekdaySeries()
    const databasePath = database.prepare("PRAGMA database_list").get() as { file: string }

    // When
    const first = createTaskSeries(database, input, "2026-09-10", instant)
    const firstItems = database.prepare("SELECT id FROM items ORDER BY id").all()
    database.close()
    database = openDatabase(databasePath.file)
    migrateDatabase(database)
    const retried = createTaskSeries(database, input, "2026-09-10", instant)

    // Then
    expect(retried).toEqual(first)
    expect(database.prepare("SELECT id FROM items ORDER BY id").all()).toEqual(firstItems)
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_series").get()).toEqual({
      count: 1,
    })
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_reminder_rules").get()).toEqual({
      count: firstItems.length * 2,
    })
  })

  it("rejects a changed payload for an existing create request without writes", () => {
    // Given
    const input = weekdaySeries()
    createTaskSeries(database, input, "2026-09-10", instant)
    const before = database.prepare("SELECT COUNT(*) AS count FROM items").get()

    // When
    const retry = () =>
      createTaskSeries(database, { ...input, title: "更改后的标题" }, "2026-09-10", instant)

    // Then
    expect(retry).toThrow(RecurrenceRequestConflictError)
    expect(database.prepare("SELECT COUNT(*) AS count FROM items").get()).toEqual(before)
  })

  it("replays the original create request after the series is later edited", () => {
    // Given
    const input = weekdaySeries()
    const series = createTaskSeries(database, input, "2026-09-10", instant)
    const edited = updateTaskSeries(
      database,
      series.id,
      { expectedVersion: series.version, status: "paused" },
      instant,
    )

    // When
    const replayed = createTaskSeries(database, input, "2026-09-10", instant)

    // Then
    expect(replayed).toEqual(edited)
  })

  it("rolls back the series and every occurrence when one item relation fails", () => {
    // Given
    const input = weekdaySeries()
    database.exec(`CREATE TRIGGER fail_occurrence_item BEFORE INSERT ON items
      BEGIN SELECT RAISE(ABORT, 'injected occurrence failure'); END`)

    // When
    const create = () => createTaskSeries(database, input, "2026-09-10", instant)

    // Then
    expect(create).toThrow()
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_series").get()).toEqual({
      count: 0,
    })
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_occurrences").get()).toEqual({
      count: 0,
    })
    expect(database.prepare("SELECT COUNT(*) AS count FROM items").get()).toEqual({ count: 0 })
  })

  it("keeps a skipped occurrence as a tombstone when the range is materialized again", () => {
    // Given
    const series = createTaskSeries(database, weekdaySeries(), "2026-09-10", instant)
    const row = database
      .prepare("SELECT item_id FROM task_occurrences WHERE series_id = ? ORDER BY occurrence_date")
      .get(series.id) as { item_id: string }
    const item = getItem(database, row.item_id, "2026-09-10")

    // When
    const skipped = skipOccurrence(database, item.id, item.version, "2026-09-10", instant)
    const created = materializeTaskSeries(
      database,
      series.id,
      { fromDate: "2026-09-10", toDate: "2026-09-10" },
      instant,
    )

    // Then
    expect(skipped.status).toBe("archived")
    expect(created).toBe(0)
    expect(
      database
        .prepare(
          "SELECT status, item_id FROM task_occurrences WHERE series_id = ? AND occurrence_date = ?",
        )
        .get(series.id, "2026-09-10"),
    ).toEqual({ status: "skipped", item_id: item.id })
  })

  it("does not regenerate an occurrence whose item was permanently removed", () => {
    // Given
    const series = createTaskSeries(database, weekdaySeries(), "2026-09-10", instant)
    const row = database
      .prepare("SELECT item_id FROM task_occurrences WHERE series_id = ? ORDER BY occurrence_date")
      .get(series.id) as { item_id: string }
    database.prepare("DELETE FROM items WHERE id = ?").run(row.item_id)

    // When
    const created = materializeTaskSeries(
      database,
      series.id,
      { fromDate: "2026-09-10", toDate: "2026-09-10" },
      instant,
    )

    // Then
    expect(created).toBe(0)
    expect(
      database
        .prepare("SELECT item_id FROM task_occurrences WHERE series_id = ? AND occurrence_date = ?")
        .get(series.id, "2026-09-10"),
    ).toEqual({ item_id: null })
  })
})
