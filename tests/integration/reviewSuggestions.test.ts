import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"

let app: FastifyInstance | undefined
let database: DatabaseSync | undefined
let directory = ""

afterEach(async () => {
  if (app !== undefined) await app.close()
  database?.close()
  if (directory !== "") rmSync(directory, { force: true, recursive: true })
  app = undefined
  database = undefined
  directory = ""
})

describe("weekly review suggestion conversion", () => {
  it("converts each suggestion once and preserves conversion state across restart", async () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-review-suggestions-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const reviewId = crypto.randomUUID()
    const suggestions = [
      { id: crypto.randomUUID(), type: "item", content: "预约体检" },
      { id: crypto.randomUUID(), type: "habit", content: "每天散步" },
      { id: crypto.randomUUID(), type: "project", content: "整理书房" },
    ] as const
    const now = new Date().toISOString()
    database
      .prepare(
        `INSERT INTO weekly_reviews
         (id, week_start, summary, completed_json, obstacles_json, suggestions_json,
          source, created_at, updated_at)
         VALUES (?, '2026-07-27', '本周回顾', '[]', '[]', ?, 'manual', ?, ?)`,
      )
      .run(reviewId, JSON.stringify(suggestions), now, now)
    const context = {
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    }
    app = await buildApp(context)

    for (const suggestion of suggestions) {
      const url = `/api/reviews/${reviewId}/suggestions/${suggestion.id}/convert`
      const first = await app.inject({ method: "POST", url })
      const second = await app.inject({ method: "POST", url })
      expect(first.statusCode).toBe(200)
      expect(second.json()).toEqual(first.json())
    }
    expect(Number(database.prepare("SELECT COUNT(*) AS value FROM items").get()?.["value"])).toBe(1)
    expect(Number(database.prepare("SELECT COUNT(*) AS value FROM habits").get()?.["value"])).toBe(
      1,
    )
    expect(
      Number(database.prepare("SELECT COUNT(*) AS value FROM projects").get()?.["value"]),
    ).toBe(1)
    const reviews = await app.inject({ method: "GET", url: "/api/reviews" })
    expect(
      reviews.json<readonly { suggestions: readonly { convertedEntityId: string | null }[] }[]>()[0]
        ?.suggestions,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ convertedEntityId: expect.any(String) })]),
    )

    await app.close()
    app = await buildApp(context)
    const afterRestart = await app.inject({ method: "GET", url: "/api/reviews" })
    expect(
      afterRestart
        .json<readonly { suggestions: readonly { convertedEntityId: string | null }[] }[]>()[0]
        ?.suggestions.every((suggestion) => suggestion.convertedEntityId !== null),
    ).toBe(true)
  })
})
