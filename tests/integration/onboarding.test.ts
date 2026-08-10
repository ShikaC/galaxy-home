import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { completeOnboarding } from "../../src/server/services/onboarding.js"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("completeOnboarding", () => {
  it("creates tutorial examples once and excludes them from real data", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-onboarding-"))
    temporaryDirectories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const input = {
      workspaceName: "岛屿实验室",
      aiNickname: "微光",
      userName: "小北",
      timezone: "Asia/Shanghai",
    } as const

    // When
    completeOnboarding(database, input)
    completeOnboarding(database, input)

    // Then
    const settings = database.prepare("SELECT * FROM workspace_settings WHERE id = 1").get()
    const tutorialItemCount = database
      .prepare("SELECT COUNT(*) AS count FROM items WHERE is_tutorial = 1")
      .get()
    const tutorialHabitCount = database
      .prepare("SELECT COUNT(*) AS count FROM habits WHERE is_tutorial = 1")
      .get()
    expect((settings as { workspace_name?: string } | undefined)?.workspace_name).toBe("岛屿实验室")
    expect((settings as { onboarding_completed?: number } | undefined)?.onboarding_completed).toBe(
      1,
    )
    expect(
      (settings as { onboarding_completed_at?: string } | undefined)?.onboarding_completed_at,
    ).toEqual(expect.any(String))
    expect((tutorialItemCount as { count?: number } | undefined)?.count).toBe(1)
    expect((tutorialHabitCount as { count?: number } | undefined)?.count).toBe(1)
    database.close()
  })
})
