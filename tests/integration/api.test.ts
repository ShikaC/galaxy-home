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
  it("rejects browser requests from non-local origins before changing state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-api-origin-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })

    const blocked = await app.inject({
      method: "POST",
      url: "/api/tutorial/dismiss",
      headers: { origin: "https://attacker.example" },
    })

    expect(blocked.statusCode).toBe(403)
    expect(blocked.json<{ code: string }>()).toMatchObject({ code: "ORIGIN_NOT_ALLOWED" })
    expect(
      database.prepare("SELECT guide_dismissed FROM tutorial_state WHERE id = 1").get(),
    ).toEqual({
      guide_dismissed: 0,
    })

    const allowed = await app.inject({
      method: "POST",
      url: "/api/tutorial/dismiss",
      headers: { origin: "http://127.0.0.1:5173" },
    })

    expect(allowed.statusCode).toBe(204)
    expect(
      database.prepare("SELECT guide_dismissed FROM tutorial_state WHERE id = 1").get(),
    ).toEqual({
      guide_dismissed: 1,
    })

    await app.close()
    database.close()
  })

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
      clock: { now: () => new Date("2026-08-05T04:00:00.000Z") },
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
    expect((await app.inject({ method: "DELETE", url: `/api/items/${itemId}` })).statusCode).toBe(
      204,
    )
    const trash = await app.inject({ method: "GET", url: "/api/trash" })
    expect(trash.json<readonly { deleted_at: string }[]>()[0]?.deleted_at).toBe(
      "2026-08-05T04:00:00.000Z",
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
      Number(
        (
          database.prepare("SELECT COUNT(*) AS value FROM ai_conversations").get() as
            | { value?: number }
            | undefined
        )?.value,
      ),
    ).toBe(0)
    expect(
      Number(
        (
          database.prepare("SELECT COUNT(*) AS value FROM ai_messages").get() as
            | { value?: number }
            | undefined
        )?.value,
      ),
    ).toBe(0)
    await app.close()
    database.close()
  })

  it("rejects a malformed restore archive before changing existing data", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-api-invalid-restore-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database
      .prepare("UPDATE workspace_settings SET workspace_name = ? WHERE id = 1")
      .run("恢复前空间")
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })

    const response = await app.inject({
      method: "POST",
      url: "/api/restore",
      headers: { "content-type": "application/zip" },
      payload: Buffer.from("not a ZIP archive"),
    })
    const workspace = database
      .prepare("SELECT workspace_name FROM workspace_settings WHERE id = 1")
      .get()
    await app.close()
    database.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: "IMPORT_ARCHIVE_INVALID",
      message: "恢复包格式错误或版本不兼容，现有数据未更改",
    })
    expect(workspace).toEqual({ workspace_name: "恢复前空间" })
  })
})
