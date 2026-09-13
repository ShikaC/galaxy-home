import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getItem, updateItem } from "../../src/server/repositories/items.js"
import {
  createTaskSeries,
  materializeTaskSeries,
  SeriesVersionConflictError,
  skipOccurrence,
  updateTaskSeries,
} from "../../src/server/services/recurrence.js"
import { replenishRecurrenceAfterItemMutation } from "../../src/server/services/recurrenceMaterializer.js"

let database: DatabaseSync
let directory: string
const instant = new Date("2026-09-10T04:00:00.000Z")
const seriesInput = () => ({
  requestId: crypto.randomUUID(),
  title: "检查客户反馈",
  priority: "medium" as const,
  categoryIds: [],
  projectIds: [],
  timezone: "Asia/Shanghai",
  startDate: "2026-09-10",
  rule: { frequency: "weekly" as const, interval: 1, weekdays: [1, 2, 3, 4, 5] },
  estimatedMinutes: 30,
  dueTime: "17:00",
  reminders: [],
})

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-lifecycle-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})
afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true })
})

describe("recurrence lifecycle", () => {
  it("protects an edited instance while applying a template change only to new occurrences", () => {
    // Given
    const series = createTaskSeries(database, seriesInput(), "2026-09-10", instant)
    const row = database
      .prepare("SELECT item_id FROM task_occurrences WHERE series_id=? ORDER BY occurrence_date")
      .get(series.id) as { item_id: string }
    const instance = getItem(database, row.item_id, "2026-09-10")
    updateItem(
      database,
      row.item_id,
      { expectedVersion: instance.version, title: "仅本次调整" },
      "2026-09-10",
      instant,
    )

    // When
    updateTaskSeries(
      database,
      series.id,
      { expectedVersion: series.version, title: "以后使用的新标题" },
      instant,
    )
    materializeTaskSeries(
      database,
      series.id,
      { fromDate: "2026-10-23", toDate: "2026-11-01" },
      instant,
    )

    // Then
    expect(getItem(database, row.item_id, "2026-09-10").title).toBe("仅本次调整")
    expect(
      database
        .prepare("SELECT is_exception FROM task_occurrences WHERE item_id=?")
        .get(row.item_id),
    ).toEqual({ is_exception: 1 })
    expect(
      database
        .prepare(`SELECT items.title FROM items JOIN task_occurrences ON task_occurrences.item_id=items.id
      WHERE task_occurrences.series_id=? AND task_occurrences.occurrence_date=?`)
        .get(series.id, "2026-10-26"),
    ).toEqual({ title: "以后使用的新标题" })
  })

  it("creates the next distant occurrence when the current instance is completed", () => {
    // Given
    const input = { ...seriesInput(), rule: { frequency: "daily" as const, interval: 60 } }
    const series = createTaskSeries(database, input, "2026-09-10", instant)
    const row = database
      .prepare("SELECT item_id FROM task_occurrences WHERE series_id=?")
      .get(series.id) as { item_id: string }
    const item = getItem(database, row.item_id, "2026-09-10")
    updateItem(
      database,
      item.id,
      { expectedVersion: item.version, status: "completed" },
      "2026-09-10",
      instant,
    )

    // When
    const created = replenishRecurrenceAfterItemMutation(database, item.id, instant)

    // Then
    expect(created).toBe(1)
    expect(
      database
        .prepare(
          "SELECT occurrence_date FROM task_occurrences WHERE series_id=? ORDER BY occurrence_date",
        )
        .all(series.id),
    ).toEqual([{ occurrence_date: "2026-09-10" }, { occurrence_date: "2026-11-09" }])
  })

  it("reopens a skipped instance without changing its occurrence identity", () => {
    // Given
    const series = createTaskSeries(database, seriesInput(), "2026-09-10", instant)
    const row = database
      .prepare("SELECT item_id FROM task_occurrences WHERE series_id=? ORDER BY occurrence_date")
      .get(series.id) as { item_id: string }
    const item = getItem(database, row.item_id, "2026-09-10")
    const skipped = skipOccurrence(database, item.id, item.version, "2026-09-10", instant)

    // When
    const reopened = updateItem(
      database,
      item.id,
      { expectedVersion: skipped.version, status: "active" },
      "2026-09-10",
      instant,
    )

    // Then
    expect(reopened.recurrenceStatus).toBe("active")
    expect(
      database
        .prepare("SELECT series_id,occurrence_date FROM task_occurrences WHERE item_id=?")
        .get(item.id),
    ).toEqual({ series_id: series.id, occurrence_date: "2026-09-10" })
  })

  it("performs no writes for a stale series update", () => {
    // Given
    const series = createTaskSeries(database, seriesInput(), "2026-09-10", instant)
    updateTaskSeries(
      database,
      series.id,
      { expectedVersion: series.version, status: "paused" },
      instant,
    )
    const before = database.prepare("SELECT total_changes() AS count").get()

    // When
    const stale = () =>
      updateTaskSeries(
        database,
        series.id,
        { expectedVersion: series.version, title: "不应保存" },
        instant,
      )

    // Then
    expect(stale).toThrow(SeriesVersionConflictError)
    expect(database.prepare("SELECT total_changes() AS count").get()).toEqual(before)
  })
})
