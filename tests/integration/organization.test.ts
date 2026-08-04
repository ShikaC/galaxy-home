import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getDailyQuote } from "../../src/server/repositories/content.js"
import { completeOnboarding } from "../../src/server/services/onboarding.js"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-organization-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  return { database, directory }
}

describe("organization settings", () => {
  it("keeps a daily quote stable while selecting across the enabled set", () => {
    const { database } = createContext()
    completeOnboarding(database, {
      workspaceName: "银河居所",
      aiNickname: "星伴",
      userName: "小河",
      timezone: "Asia/Shanghai",
    })
    const first = getDailyQuote(database, "2026-08-01")
    expect(getDailyQuote(database, "2026-08-01")).toEqual(first)
    const selections = new Set(
      Array.from(
        { length: 30 },
        (_value, index) =>
          getDailyQuote(database, `2026-08-${String(index + 1).padStart(2, "0")}`)?.id,
      ),
    )
    expect(selections.size).toBeGreaterThan(1)
    database.close()
  })

  it("edits category name, color, and icon through the API", async () => {
    const { database, directory } = createContext()
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })
    const created = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: "家务", color: "#26734d", icon: "home" },
    })
    const id = created.json<{ id: string }>().id
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/categories/${id}`,
      payload: { name: "居家", color: "#9a4d2f", icon: "heart" },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toEqual(
      expect.objectContaining({ name: "居家", color: "#9a4d2f", icon: "heart" }),
    )
    await app.close()
    database.close()
  })
})
