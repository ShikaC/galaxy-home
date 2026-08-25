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

describe("local API security boundary", () => {
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
    ).toEqual({ guide_dismissed: 0 })

    const allowed = await app.inject({
      method: "POST",
      url: "/api/tutorial/dismiss",
      headers: { origin: "http://127.0.0.1:5173" },
    })
    expect(allowed.statusCode).toBe(204)
    expect(
      database.prepare("SELECT guide_dismissed FROM tutorial_state WHERE id = 1").get(),
    ).toEqual({ guide_dismissed: 1 })

    await app.close()
    database.close()
  })

  it("rejects production state changes without a browser origin", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-api-production-origin-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp(
      {
        database,
        dataDirectory: directory,
        backupDirectory: join(directory, "backups"),
        secretPath: join(directory, "secrets.json"),
      },
      true,
    )

    const blocked = await app.inject({ method: "POST", url: "/api/tutorial/dismiss" })
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json()).toEqual({
      code: "ORIGIN_NOT_ALLOWED",
      message: "只允许本机页面访问此服务",
    })
    expect(
      database.prepare("SELECT guide_dismissed FROM tutorial_state WHERE id = 1").get(),
    ).toEqual({ guide_dismissed: 0 })

    await app.close()
    database.close()
  })

  it("requires a production capability cookie and bootstraps it once", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-api-capability-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp(
      {
        database,
        dataDirectory: directory,
        backupDirectory: join(directory, "backups"),
        secretPath: join(directory, "secrets.json"),
        apiCapability: "test-capability",
      },
      true,
    )

    try {
      const missing = await app.inject({
        method: "POST",
        url: "/api/tutorial/dismiss",
        headers: { origin: "http://127.0.0.1:4173" },
      })
      expect(missing.statusCode).toBe(401)
      expect(missing.json()).toEqual({
        code: "API_CAPABILITY_REQUIRED",
        message: "桌面会话已失效，请重新打开应用",
      })

      const bootstrap = await app.inject({
        method: "POST",
        url: "/api/session",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-galaxy-capability": "test-capability",
        },
      })
      expect(bootstrap.statusCode).toBe(204)
      const setCookie = bootstrap.headers["set-cookie"]
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie
      if (cookieHeader === undefined) throw new Error("会话 bootstrap 缺少 cookie")

      const attacker = await app.inject({
        method: "POST",
        url: "/api/tutorial/dismiss",
        headers: {
          origin: "https://attacker.example",
          cookie: cookieHeader.split(";", 1)[0],
        },
      })
      expect(attacker.statusCode).toBe(403)
      expect(
        database.prepare("SELECT guide_dismissed FROM tutorial_state WHERE id = 1").get(),
      ).toEqual({ guide_dismissed: 0 })

      const allowed = await app.inject({
        method: "POST",
        url: "/api/tutorial/dismiss",
        headers: { cookie: cookieHeader.split(";", 1)[0] },
      })
      expect(allowed.statusCode).toBe(204)

      const wrong = await app.inject({
        method: "POST",
        url: "/api/session",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-galaxy-capability": "wrong-capability",
        },
      })
      expect(wrong.statusCode).toBe(401)
    } finally {
      await app.close()
      database.close()
    }
  })
})
