import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getSettings } from "../../src/server/repositories/settings.js"
import { buildAiContext } from "../../src/server/services/aiContext.js"

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

  it("falls back to page context when a project route no longer exists", () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-missing-project-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)

    const context = buildAiContext(
      database,
      getSettings(database),
      `/projects/${crypto.randomUUID()}`,
      "项目",
      "我想继续推进",
    )
    expect(context.references).toEqual([{ type: "page", id: null, label: "项目" }])
  })

  it("labels active and historical same-title items for AI disambiguation", () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-context-same-title-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database.prepare("UPDATE workspace_settings SET ai_permission = 'open'").run()
    const timestamp = new Date().toISOString()
    for (const status of ["active", "completed"] as const) {
      database
        .prepare(
          `INSERT INTO items (id, title, notes, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          crypto.randomUUID(),
          "同名待办",
          status === "active" ? "当前要做" : "历史记录",
          status,
          timestamp,
          timestamp,
        )
    }

    const context = buildAiContext(database, getSettings(database), "/", "首页", "请处理同名待办")
    const prompt = z
      .object({
        localContext: z.array(
          z.object({
            type: z.string().optional(),
            title: z.string().optional(),
            status: z.string().optional(),
          }),
        ),
      })
      .parse(JSON.parse(context.prompt))

    expect(prompt.localContext).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "item", title: "同名待办", status: "active" }),
        expect.objectContaining({ type: "item", title: "同名待办", status: "completed" }),
      ]),
    )
  })

  it("includes an explicit focus item even under conservative permission", () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-focus-item-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database.prepare("UPDATE workspace_settings SET ai_permission = 'conservative'").run()
    const itemId = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    database
      .prepare(
        `INSERT INTO items (id, title, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      )
      .run(itemId, "写完对抗审查计划表", "只保留今天能完成的一步", timestamp, timestamp)

    const context = buildAiContext(
      database,
      getSettings(database),
      "/",
      "首页",
      "请帮我缩小这件事",
      itemId,
    )
    expect(context.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item",
          id: itemId,
          label: "写完对抗审查计划表",
        }),
      ]),
    )
    expect(JSON.parse(context.prompt).localContext).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          focused: true,
          title: "写完对抗审查计划表",
          notes: "只保留今天能完成的一步",
        }),
      ]),
    )
  })
})
