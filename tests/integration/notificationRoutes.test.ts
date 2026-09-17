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
      .json<readonly { id: string; kind: string; title: string; detail: string }[]>()
      .find((notification) => notification.kind === "morning")
    expect(morning).toMatchObject({
      title: "今天最想推进什么？",
      detail: "记下此刻想到的一件事，或保留一个足够小的今日重点。",
    })
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

  it("平台投递与应用内横幅各记各的，互不吞掉对方的提醒", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-platform-channel-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00', morning_reminder_enabled = 1, evening_reminder_enabled = 0, weekly_review_enabled = 0",
      )
      .run()
    const now = new Date("2026-08-04T02:00:00.000Z")
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => now },
    })

    const firstClaim = await app.inject({ method: "POST", url: "/api/notifications/platform" })
    expect(firstClaim.statusCode).toBe(200)
    const claimed = firstClaim.json<readonly { id: string; kind: string; title: string }[]>()
    expect(claimed.length).toBeGreaterThan(0)
    expect(claimed.every((notification) => notification.title.length > 0)).toBe(true)

    // 再次领取为空：平台投递是一次性的，重启轮询不会重复弹同一批系统通知。
    expect(
      (await app.inject({ method: "POST", url: "/api/notifications/platform" })).json<
        readonly { id: string }[]
      >(),
    ).toEqual([])

    // 应用内横幅不受平台投递影响，仍然拿得到同一条未处理提醒。
    const banner = (await app.inject({ method: "GET", url: "/api/notifications" })).json<
      readonly { id: string }[]
    >()
    expect(banner.map((notification) => notification.id)).toEqual([...claimed.map((row) => row.id)])

    // 反过来也不成立：横幅已经领过，平台通道仍然要能领到，否则关掉窗口就永远收不到了。
    const otherDirectory = mkdtempSync(join(tmpdir(), "galaxy-home-platform-channel-b-"))
    directories.push(otherDirectory)
    const otherDatabase = openDatabase(join(otherDirectory, "app.sqlite"))
    migrateDatabase(otherDatabase)
    otherDatabase
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00', morning_reminder_enabled = 1, evening_reminder_enabled = 0, weekly_review_enabled = 0",
      )
      .run()
    const otherApp = await buildApp({
      database: otherDatabase,
      dataDirectory: otherDirectory,
      backupDirectory: join(otherDirectory, "backups"),
      secretPath: join(otherDirectory, "secrets.json"),
      clock: { now: () => now },
    })
    const seenByBanner = (await otherApp.inject({ method: "GET", url: "/api/notifications" })).json<
      readonly { id: string }[]
    >()
    expect(seenByBanner.length).toBeGreaterThan(0)
    expect(
      (await otherApp.inject({ method: "POST", url: "/api/notifications/platform" }))
        .json<readonly { id: string }[]>()
        .map((notification) => notification.id),
    ).toEqual(seenByBanner.map((notification) => notification.id))

    await otherApp.close()
    otherDatabase.close()
    await app.close()
    database.close()
  })

  it("桌面进程只用能力 Cookie 就能领取，不必先走 /api/session 引导", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-platform-capability-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00', morning_reminder_enabled = 1, evening_reminder_enabled = 0, weekly_review_enabled = 0",
      )
      .run()
    const capability = "desktop-token-abc123"
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => new Date("2026-08-04T02:00:00.000Z") },
      apiCapability: capability,
    })

    // 这是 Rust 端的请求形状：只带 Cookie，不带头部令牌、也没有 Origin。
    const withCookie = await app.inject({
      method: "POST",
      url: "/api/notifications/platform",
      headers: { cookie: `galaxy_capability=${capability}` },
    })
    expect(withCookie.statusCode).toBe(200)
    expect(withCookie.json<readonly { id: string }[]>().length).toBeGreaterThan(0)

    // 令牌不匹配时必须被拦：这是只绑回环地址但仍需保护的读取入口。
    const withoutCookie = await app.inject({
      method: "POST",
      url: "/api/notifications/platform",
    })
    expect(withoutCookie.statusCode).toBe(401)
    expect(withoutCookie.json<{ code: string }>().code).toBe("API_CAPABILITY_REQUIRED")

    await app.close()
    database.close()
  })

  it("平台投递在应用重启后不重复，且只领取未延期到未来的提醒", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-platform-restart-"))
    directories.push(directory)
    const path = join(directory, "app.sqlite")
    const now = new Date("2026-08-04T02:00:00.000Z")
    const context = {
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => now },
    }

    const firstDatabase = openDatabase(path)
    migrateDatabase(firstDatabase)
    firstDatabase
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00', morning_reminder_enabled = 1, evening_reminder_enabled = 0, weekly_review_enabled = 0",
      )
      .run()
    const firstApp = await buildApp({ database: firstDatabase, ...context })
    const claimed = (
      await firstApp.inject({ method: "POST", url: "/api/notifications/platform" })
    ).json<readonly { id: string }[]>()
    expect(claimed.length).toBeGreaterThan(0)
    await firstApp.close()
    firstDatabase.close()

    const secondDatabase = openDatabase(path)
    migrateDatabase(secondDatabase)
    const secondApp = await buildApp({ database: secondDatabase, ...context })
    expect(
      (await secondApp.inject({ method: "POST", url: "/api/notifications/platform" })).json<
        readonly { id: string }[]
      >(),
    ).toEqual([])
    await secondApp.close()
    secondDatabase.close()
  })

  it("switches morning reminder copy when today focus is set", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-morning-focus-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database
      .prepare(
        "UPDATE workspace_settings SET timezone = 'Asia/Shanghai', morning_reminder_time = '09:00', morning_reminder_enabled = 1",
      )
      .run()
    const itemId = crypto.randomUUID()
    const nowIso = "2026-08-04T02:00:00.000Z"
    database
      .prepare(
        `INSERT INTO items (id, title, notes, status, sort_order, created_at, updated_at)
         VALUES (?, '推进 React', NULL, 'active', 0, ?, ?)`,
      )
      .run(itemId, nowIso, nowIso)
    database
      .prepare(
        `INSERT INTO today_items (item_id, local_date, is_focus, is_secondary, sort_order)
         VALUES (?, '2026-08-04', 1, 0, 0)`,
      )
      .run(itemId)

    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
      clock: { now: () => new Date(nowIso) },
    })
    const due = await app.inject({ method: "GET", url: "/api/notifications" })
    const morning = due
      .json<readonly { kind: string; title: string; detail: string }[]>()
      .find((notification) => notification.kind === "morning")
    expect(morning).toMatchObject({
      title: "今日重点已就位",
      detail: "专注推进「推进 React」即可，不必再另找一件。",
    })

    await app.close()
    database.close()
  })
})
