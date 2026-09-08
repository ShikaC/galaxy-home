import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { WORKSPACE_DATABASE_FILE } from "../../src/server/lib/workspacePaths.js"
import { createItem } from "../../src/server/repositories/items.js"
import { completeOnboarding } from "../../src/server/services/onboarding.js"
import { seedTutorialExamples } from "../helpers/tutorialExamples.js"

const directories: string[] = []
const countSchema = z.object({ count: z.number() })
const pathsSchema = z.object({
  backupDirectory: z.string(),
  dataDirectory: z.string(),
  databaseFile: z.string(),
  source: z.enum(["env", "default"]),
})

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

async function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-workspace-paths-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  completeOnboarding(database, {
    workspaceName: "银河居所",
    aiNickname: "星伴",
    userName: "小河",
    timezone: "Asia/Shanghai",
  })
  const app = await buildApp({
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: join(directory, "secrets.json"),
  })
  return { app, database, directory }
}

describe("workspace data path and tutorial examples", () => {
  it("exposes absolute workspace paths on meta", async () => {
    const { app, database, directory } = await createTestApp()
    const meta = await app.inject({ method: "GET", url: "/api/meta" })
    const paths = pathsSchema.parse(meta.json<{ paths: unknown }>().paths)

    expect(isAbsolute(paths.dataDirectory)).toBe(true)
    expect(paths.dataDirectory).toBe(directory)
    expect(paths.databaseFile).toBe(join(directory, WORKSPACE_DATABASE_FILE))
    expect(paths.backupDirectory).toBe(join(directory, "backups"))
    expect(paths.databaseFile.startsWith(paths.dataDirectory)).toBe(true)
    await app.close()
    database.close()
  })

  it("clears remaining tutorial examples without touching real items", async () => {
    const { app, database } = await createTestApp()
    seedTutorialExamples(database)
    createItem(database, { title: "真实待办", categoryIds: [], projectIds: [] }, "2026-08-04")

    const before = await app.inject({ method: "GET", url: "/api/meta" })
    expect(before.json<{ tutorial: { exampleCount: number } }>().tutorial.exampleCount).toBe(2)

    const cleared = await app.inject({ method: "POST", url: "/api/tutorial/examples/clear" })
    expect(cleared.statusCode).toBe(204)

    const tutorialItems = countSchema.parse(
      database
        .prepare("SELECT COUNT(*) AS count FROM items WHERE is_tutorial = 1 AND deleted_at IS NULL")
        .get(),
    )
    const tutorialHabits = countSchema.parse(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM habits WHERE is_tutorial = 1 AND deleted_at IS NULL",
        )
        .get(),
    )
    const realItems = countSchema.parse(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM items WHERE is_tutorial = 0 AND deleted_at IS NULL AND title = ?",
        )
        .get("真实待办"),
    )
    const after = await app.inject({ method: "GET", url: "/api/meta" })
    expect(tutorialItems.count).toBe(0)
    expect(tutorialHabits.count).toBe(0)
    expect(realItems.count).toBe(1)
    expect(after.json<{ tutorial: { exampleCount: number } }>().tutorial.exampleCount).toBe(0)
    await app.close()
    database.close()
  })
})
