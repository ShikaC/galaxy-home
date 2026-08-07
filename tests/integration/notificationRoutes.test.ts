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

describe("notification routes", () => {
  it("lists missed morning reminders and supports snooze plus dismiss", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-notifications-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00', morning_reminder_enabled = 1",
      )
      .run()

    let now = new Date("2026-08-04T02:00:00.000Z")
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => now },
    })

    const due = await app.inject({ method: "GET", url: "/api/notifications" })
    expect(due.statusCode).toBe(200)
    const morning = due
      .json<readonly { id: string; kind: string; title: string }[]>()
      .find((notification) => notification.kind === "morning")
    expect(morning).toMatchObject({ title: "今天最想推进什么？" })
    if (morning === undefined) throw new Error("缺少晨间提醒")

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/notifications/${morning.id}/snooze`,
          payload: { minutes: 30 },
        })
      ).statusCode,
    ).toBe(204)
    now = new Date("2026-08-04T02:10:00.000Z")
    expect(
      (await app.inject({ method: "GET", url: "/api/notifications" }))
        .json<readonly { id: string }[]>()
        .some((notification) => notification.id === morning.id),
    ).toBe(false)

    now = new Date("2026-08-04T02:31:00.000Z")
    expect(
      (await app.inject({ method: "GET", url: "/api/notifications" }))
        .json<readonly { id: string }[]>()
        .some((notification) => notification.id === morning.id),
    ).toBe(true)

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/notifications/${morning.id}/dismiss`,
        })
      ).statusCode,
    ).toBe(204)
    expect(
      (await app.inject({ method: "GET", url: "/api/notifications" }))
        .json<readonly { id: string }[]>()
        .some((notification) => notification.id === morning.id),
    ).toBe(false)

    await app.close()
    database.close()
  })
})
