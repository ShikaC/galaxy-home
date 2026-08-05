import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe("workspace timezone boundaries", () => {
  it("uses the workspace date when creating and updating day projections", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-timezone-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => new Date("2099-01-01T00:30:00.000Z") },
    })

    await app.inject({
      method: "POST",
      url: "/api/onboarding",
      payload: {
        workspaceName: "银河居所",
        aiNickname: "星伴",
        userName: "小河",
        timezone: "Asia/Shanghai",
      },
    })
    const createdItem = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "跨日待办", categoryIds: [], projectIds: [] },
    })
    const itemId = createdItem.json<{ id: string }>().id
    await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/today`,
      payload: { localDate: "2099-01-01", isFocus: false, isSecondary: false },
    })
    const updatedItem = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}`,
      payload: { notes: "保留今日归属" },
    })

    const createdHabit = await app.inject({
      method: "POST",
      url: "/api/habits",
      payload: {
        name: "周三休息",
        type: "check",
        targetCount: 1,
        frequencyType: "daily",
        weeklyTarget: null,
        restDays: [4],
      },
    })

    expect(updatedItem.json<{ inToday: boolean }>().inToday).toBe(true)
    expect(createdHabit.json<{ isRestDay: boolean }>().isRestDay).toBe(true)
    await app.close()
    database.close()
  })
})
