import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { buildAiContext } from "../../src/server/services/aiContext.js"
import { getSettings } from "../../src/server/repositories/settings.js"

let database: DatabaseSync | undefined
let directory = ""

afterEach(() => {
  database?.close()
  if (directory !== "") rmSync(directory, { force: true, recursive: true })
  database = undefined
  directory = ""
})

describe("AI workspace context", () => {
  it("includes a bounded snapshot across workspace areas for overview requests", () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-context-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database.prepare("UPDATE workspace_settings SET ai_permission = 'open'").run()
    const timestamp = new Date().toISOString()
    database
      .prepare(
        `INSERT INTO items (id, title, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      )
      .run(crypto.randomUUID(), "晨间拉伸计划", "周一到周五各十分钟", timestamp, timestamp)
    database
      .prepare(
        `INSERT INTO daily_gains (id, local_date, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), "2026-08-05", "完成了第一次十分钟拉伸", timestamp, timestamp)

    const context = buildAiContext(
      database,
      getSettings(database),
      "/",
      "首页",
      "请概览整个工作空间",
    )
    expect(context.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "item", label: "晨间拉伸计划" }),
        expect.objectContaining({ type: "gain", label: "完成了第一次十分钟拉伸" }),
      ]),
    )
    expect(JSON.parse(context.prompt).localContext.length).toBeLessThanOrEqual(24)
  })
})
