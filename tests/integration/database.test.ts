import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("database migrations", () => {
  it("creates every core table on an empty database", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-database-"))
    temporaryDirectories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))

    // When
    migrateDatabase(database)

    // Then
    const rows = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
    const names = rows.map((row) => row["name"])
    expect(names).toEqual(
      expect.arrayContaining([
        "workspace_settings",
        "items",
        "categories",
        "today_items",
        "projects",
        "habits",
        "habit_logs",
        "daily_gains",
        "weekly_reviews",
        "ai_conversations",
        "scheduler_state",
        "trash_entries",
      ]),
    )
    database.close()
  })
})
