import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"

const directories: string[] = []
afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { force: true, recursive: true })
  })
})

describe("local API", () => {
  it("completes onboarding and persists a captured item through HTTP", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-api-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })

    const onboarding = await app.inject({
      method: "POST",
      url: "/api/onboarding",
      payload: {
        workspaceName: "银河居所",
        aiNickname: "星伴",
        userName: "小河",
        timezone: "Asia/Shanghai",
      },
    })
    expect(onboarding.statusCode).toBe(200)
    const created = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "把散落想法收进来", categoryIds: [], projectIds: [] },
    })
    expect(created.statusCode).toBe(201)
    const itemId = created.json<{ id: string }>().id
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/items/${itemId}/today`,
          payload: { localDate: "2026-08-04", isFocus: true, isSecondary: false },
        })
      ).statusCode,
    ).toBe(204)
    const today = await app.inject({
      method: "GET",
      url: "/api/items?view=today&localDate=2026-08-04",
    })
    expect(today.json<readonly { title: string; isFocus: boolean }[]>()).toContainEqual(
      expect.objectContaining({ title: "把散落想法收进来", isFocus: true }),
    )
    expect(
      (await app.inject({ method: "GET", url: "/api/ai/config" })).json<{ configured: boolean }>()
        .configured,
    ).toBe(false)
    const unavailable = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: { conversationId: null, content: "请帮我拆解任务" },
    })
    expect(unavailable.statusCode).toBe(503)
    expect(
      Number(database.prepare("SELECT COUNT(*) AS value FROM ai_conversations").get()?.["value"]),
    ).toBe(0)
    expect(
      Number(database.prepare("SELECT COUNT(*) AS value FROM ai_messages").get()?.["value"]),
    ).toBe(0)
    await app.close()
    database.close()
  })
})
