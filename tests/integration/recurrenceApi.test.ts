import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"

const directories: string[] = []
afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true })
  })
})

describe("task series API", () => {
  it("returns a structured conflict when a new series references a missing relation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-api-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => new Date("2026-09-10T04:00:00.000Z") },
    })
    const requestId = crypto.randomUUID()

    const response = await app.inject({
      method: "POST",
      url: "/api/task-series",
      payload: {
        requestId,
        title: "引用不存在分类",
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 1 },
        categoryIds: [crypto.randomUUID()],
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "TASK_SERIES_RELATION_NOT_FOUND",
        entityId: requestId,
      }),
    )
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_series").get()).toEqual({
      count: 0,
    })
    await app.close()
    database.close()
  })

  it("creates, lists, updates, materializes and skips a series with version conflicts", async () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-recurrence-api-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => new Date("2026-09-10T04:00:00.000Z") },
    })
    const requestId = crypto.randomUUID()
    const payload = {
      requestId,
      title: "检查客户反馈",
      timezone: "Asia/Shanghai",
      startDate: "2026-09-10",
      rule: { frequency: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] },
      dueTime: "17:00",
      reminders: [{ anchor: "due", offsetMinutes: 10 }],
    }

    // When
    const created = await app.inject({ method: "POST", url: "/api/task-series", payload })
    const series = created.json<{ id: string; version: number }>()
    const listed = await app.inject({ method: "GET", url: "/api/task-series" })
    const materialized = await app.inject({
      method: "POST",
      url: `/api/task-series/${series.id}/materialize`,
      payload: { requestId: crypto.randomUUID(), fromDate: "2026-10-23", toDate: "2026-10-30" },
    })
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/task-series/${series.id}`,
      payload: { expectedVersion: series.version, status: "paused" },
    })
    const stale = await app.inject({
      method: "PATCH",
      url: `/api/task-series/${series.id}`,
      payload: { expectedVersion: series.version, title: "过期写入" },
    })
    const occurrence = database
      .prepare("SELECT item_id FROM task_occurrences WHERE series_id = ? ORDER BY occurrence_date")
      .get(series.id) as { item_id: string }
    const item = (
      await app.inject({
        method: "GET",
        url: "/api/items?view=active&localDate=2026-09-10",
      })
    )
      .json<readonly { id: string; version: number }[]>()
      .find((value) => value.id === occurrence.item_id)
    if (item === undefined) throw new Error("Expected materialized item")
    const skipped = await app.inject({
      method: "POST",
      url: `/api/items/${item.id}/skip`,
      payload: { expectedVersion: item.version },
    })
    const distant = await app.inject({
      method: "POST",
      url: "/api/task-series",
      payload: {
        ...payload,
        requestId: crypto.randomUUID(),
        title: "远期任务",
        rule: { frequency: "daily", interval: 60 },
        reminders: [],
      },
    })
    const distantId = distant.json<{ id: string }>().id
    const distantOccurrence = database
      .prepare("SELECT item_id FROM task_occurrences WHERE series_id = ?")
      .get(distantId) as { item_id: string }
    const distantItem = (
      await app.inject({
        method: "GET",
        url: "/api/items?view=active&localDate=2026-09-10",
      })
    )
      .json<readonly { id: string; version: number }[]>()
      .find((value) => value.id === distantOccurrence.item_id)
    if (distantItem === undefined) throw new Error("Expected distant occurrence")
    const completed = await app.inject({
      method: "PATCH",
      url: `/api/items/${distantItem.id}`,
      payload: { expectedVersion: distantItem.version, status: "completed" },
    })

    // Then
    expect(created.statusCode).toBe(201)
    expect(listed.json<readonly { id: string }[]>()).toContainEqual(
      expect.objectContaining({ id: requestId }),
    )
    expect(updated.statusCode).toBe(200)
    expect(materialized.statusCode).toBe(200)
    expect(materialized.json<{ createdCount: number }>().createdCount).toBeGreaterThan(0)
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toEqual(
      expect.objectContaining({
        code: "SERIES_VERSION_CONFLICT",
        entityId: requestId,
        currentVersion: series.version + 1,
      }),
    )
    expect(skipped.statusCode).toBe(200)
    expect(skipped.json()).toEqual(
      expect.objectContaining({ id: item.id, recurrenceStatus: "skipped" }),
    )
    expect(completed.statusCode).toBe(200)
    expect(
      database
        .prepare(
          "SELECT occurrence_date FROM task_occurrences WHERE series_id = ? ORDER BY occurrence_date",
        )
        .all(distantId),
    ).toEqual([{ occurrence_date: "2026-09-10" }, { occurrence_date: "2026-11-09" }])
    await app.close()
    database.close()
  })
})
