import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { insertTaskSeries } from "../../src/server/repositories/taskSeries.js"
import { createManualExport, restoreManualExport } from "../../src/server/services/backup.js"
import { exportSchema } from "../../src/server/services/backupSchema.js"
import { createTaskSeriesInputSchema } from "../../src/shared/recurrence.js"

const directories: string[] = []
afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { force: true, recursive: true })
  })
})

describe("task backup", () => {
  it("round trips task relationships and preserves archived item versions", async () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-task-backup-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const now = "2026-09-10T10:00:00.000Z"
    const parentId = crypto.randomUUID()
    const childId = crypto.randomUUID()
    const seriesId = crypto.randomUUID()
    const ruleId = crypto.randomUUID()
    database
      .prepare(
        "INSERT INTO items (id,title,status,created_at,updated_at) VALUES (?,?,'active',?,?)",
      )
      .run(parentId, "parent", now, now)
    database
      .prepare(
        `INSERT INTO items
         (id,title,status,parent_id,due_at,scheduled_start_at,scheduled_end_at,schedule_timezone,created_at,updated_at)
         VALUES (?,?,'active',?,?,?,?,?,?,?)`,
      )
      .run(
        childId,
        "child",
        parentId,
        "2026-09-11T10:00:00.000Z",
        "2026-09-11T08:00:00.000Z",
        "2026-09-11T09:00:00.000Z",
        "Asia/Shanghai",
        now,
        now,
      )
    insertTaskSeries(
      database,
      createTaskSeriesInputSchema.parse({
        requestId: seriesId,
        title: "series",
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 1 },
      }),
      new Date(now),
    )
    database
      .prepare(
        `INSERT INTO task_occurrences
         (series_id,occurrence_date,item_id,created_at,updated_at) VALUES (?,?,?,?,?)`,
      )
      .run(seriesId, "2026-09-10", childId, now, now)
    database
      .prepare(
        `INSERT INTO task_reminder_rules
         (id,item_id,anchor,offset_minutes,created_at,updated_at) VALUES (?,?,'scheduled',15,?,?)`,
      )
      .run(ruleId, childId, now, now)
    database.prepare("UPDATE items SET version = 37 WHERE id = ?").run(childId)
    const payload = unzipSync(createManualExport(database))["galaxy-home.json"]
    if (payload === undefined) throw new Error("Missing archive")
    const archive = exportSchema.parse(JSON.parse(strFromU8(payload)))
    archive.tables["items"]?.reverse()
    const bytes = zipSync({ "galaxy-home.json": strToU8(JSON.stringify(archive)) })
    database.prepare("DELETE FROM items WHERE id IN (?, ?)").run(childId, parentId)
    database.prepare("DELETE FROM task_series WHERE id = ?").run(seriesId)

    // When
    await restoreManualExport(database, bytes, join(directory, "backups"))

    // Then
    expect(
      database.prepare("SELECT parent_id, version FROM items WHERE id = ?").get(childId),
    ).toEqual({
      parent_id: parentId,
      version: 37,
    })
    expect(
      database
        .prepare("SELECT item_id FROM task_occurrences WHERE series_id = ? AND occurrence_date = ?")
        .get(seriesId, "2026-09-10"),
    ).toEqual({ item_id: childId })
    expect(
      database.prepare("SELECT item_id FROM task_reminder_rules WHERE id = ?").get(ruleId),
    ).toEqual({
      item_id: childId,
    })
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    database.close()
  })

  it.each([null, 30])(
    "imports schema version 1 with safe defaults and legacy reminder %s",
    async (minutes) => {
      // Given
      const directory = mkdtempSync(join(tmpdir(), "galaxy-home-v1-import-"))
      directories.push(directory)
      const database = openDatabase(join(directory, "app.sqlite"))
      migrateDatabase(database)
      const archiveFile = unzipSync(createManualExport(database))["galaxy-home.json"]
      if (archiveFile === undefined) throw new Error("测试导出缺少 JSON")
      const source = exportSchema.parse(JSON.parse(strFromU8(archiveFile)))
      source.schemaVersion = 1
      delete source.tables["item_create_requests"]
      delete source.tables["task_series"]
      delete source.tables["task_occurrences"]
      delete source.tables["task_reminder_rules"]
      delete source.tables["task_plan_runs"]
      source.tables["items"] = [
        {
          id: crypto.randomUUID(),
          title: "legacy",
          notes: null,
          due_at: minutes === null ? null : "2026-09-10T08:00:00.000Z",
          reminder_minutes: minutes,
          status: "active",
          completed_at: null,
          sort_order: 0,
          is_tutorial: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          deleted_at: null,
        },
      ]
      const bytes = zipSync({ "galaxy-home.json": strToU8(JSON.stringify(source)) })

      // When
      await restoreManualExport(database, bytes, join(directory, "backups"))

      // Then
      expect(database.prepare("SELECT priority, version, is_fixed FROM items").get()).toEqual({
        priority: "none",
        version: 1,
        is_fixed: 0,
      })
      expect(database.prepare("SELECT offset_minutes FROM task_reminder_rules").all()).toEqual(
        minutes === null ? [] : [{ offset_minutes: minutes }],
      )
      expect(database.prepare("SELECT COUNT(*) AS count FROM task_series").get()).toEqual({
        count: 0,
      })
      database.close()
    },
  )

  it("rolls back every restored table when a row violates a database constraint", async () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-restore-rollback-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database.prepare("UPDATE workspace_settings SET workspace_name = ? WHERE id = 1").run("before")
    const archiveFile = unzipSync(createManualExport(database))["galaxy-home.json"]
    if (archiveFile === undefined) throw new Error("测试导出缺少 JSON")
    const source = exportSchema.parse(JSON.parse(strFromU8(archiveFile)))
    const itemId = crypto.randomUUID()
    const settings = source.tables["workspace_settings"]?.[0]
    if (settings === undefined) throw new Error("Missing test settings")
    settings["workspace_name"] = "after"
    source.tables["items"] = [
      {
        id: itemId,
        title: "invalid",
        status: "active",
        priority: "impossible",
        version: 1,
        is_fixed: 0,
        sort_order: 0,
        is_tutorial: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]
    const bytes = zipSync({ "galaxy-home.json": strToU8(JSON.stringify(source)) })

    // When / Then
    await expect(restoreManualExport(database, bytes, join(directory, "backups"))).rejects.toThrow()
    expect(
      database.prepare("SELECT workspace_name FROM workspace_settings WHERE id = 1").get(),
    ).toEqual({
      workspace_name: "before",
    })
    expect(database.prepare("SELECT id FROM items WHERE id = ?").get(itemId)).toBeUndefined()
    database.close()
  })
})

it("rejects corrupt current series fields even when its original create request is valid", async () => {
  // Given
  const directory = mkdtempSync(join(tmpdir(), "galaxy-series-corrupt-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "db.sqlite"))
  migrateDatabase(database)
  const id = crypto.randomUUID()
  insertTaskSeries(
    database,
    createTaskSeriesInputSchema.parse({
      requestId: id,
      title: "feedback",
      timezone: "Asia/Shanghai",
      startDate: "2026-09-10",
      rule: { frequency: "daily", interval: 1 },
      dueTime: "17:00",
    }),
    new Date("2026-09-10T08:00:00.000Z"),
  )
  const payload = unzipSync(createManualExport(database))["galaxy-home.json"]
  if (payload === undefined) throw new Error("Missing archive")
  const archive = exportSchema.parse(JSON.parse(strFromU8(payload)))
  const series = archive.tables["task_series"]?.[0]
  if (series === undefined) throw new Error("Missing series")
  series["due_time"] = "25:00"
  // When / Then
  await expect(
    restoreManualExport(
      database,
      zipSync({ "galaxy-home.json": strToU8(JSON.stringify(archive)) }),
      join(directory, "backups"),
    ),
  ).rejects.toThrow()
  expect(database.prepare("SELECT due_time FROM task_series WHERE id=?").get(id)).toEqual({
    due_time: "17:00",
  })
  database.close()
})
