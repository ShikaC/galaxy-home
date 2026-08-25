import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createManualExport } from "../../src/server/services/backup.js"

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

  it("rejects a restore archive missing a required table before changing existing data", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-api-missing-table-"))
    directories.push(directory)
    const backupDirectory = join(directory, "backups")
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database
      .prepare("UPDATE workspace_settings SET workspace_name = ? WHERE id = 1")
      .run("恢复前空间")
    const exported = unzipSync(createManualExport(database))["galaxy-home.json"]
    if (exported === undefined) throw new Error("测试导出缺少 JSON")
    const payload = z
      .object({ tables: z.record(z.string(), z.unknown()) })
      .passthrough()
      .parse(JSON.parse(strFromU8(exported)))
    const tables = Object.fromEntries(
      Object.entries(payload.tables).filter(([table]) => table !== "workspace_settings"),
    )
    const archive = zipSync({ "galaxy-home.json": strToU8(JSON.stringify({ ...payload, tables })) })
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory,
      secretPath: join(directory, "secrets.json"),
    })

    const response = await app.inject({
      method: "POST",
      url: "/api/restore",
      headers: { "content-type": "application/zip" },
      payload: Buffer.from(archive),
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
    expect(existsSync(backupDirectory)).toBe(false)
  })
})
