import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { itemDetailSchema, itemSchema } from "../../src/shared/items.js"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-task-core-api-"))
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  const app = await buildApp({
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: join(directory, "secrets.json"),
    clock: { now: () => new Date("2026-09-10T04:00:00.000Z") },
  })
  cleanup.push(async () => {
    await app.close()
    database.close()
    rmSync(directory, { force: true, recursive: true })
  })
  return { app, database }
}

describe("task core HTTP API", () => {
  it("creates atomically for today and returns task detail with subtasks", async () => {
    // Given
    const { app } = await setup()
    const requestId = crypto.randomUUID()
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: {
        requestId,
        title: "父任务",
        today: { localDate: "2026-09-10", isFocus: false, isSecondary: false },
      },
    })
    const parent = itemSchema.parse(createdResponse.json())

    // When
    await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "子任务", parentId: parent.id },
    })
    const detailResponse = await app.inject({ method: "GET", url: `/api/items/${parent.id}` })

    // Then
    expect(createdResponse.statusCode).toBe(201)
    const detail = itemDetailSchema.parse(detailResponse.json())
    expect(detail).toMatchObject({ inToday: true, subtaskCount: 1 })
    expect(detail.subtasks.map((item) => item.title)).toEqual(["子任务"])
  })

  it("rejects malformed dates and returns a structured stale conflict", async () => {
    // Given
    const { app } = await setup()
    const malformed = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "坏日期", dueDate: "2026-02-30" },
    })
    const created = itemSchema.parse(
      (await app.inject({ method: "POST", url: "/api/items", payload: { title: "版本" } })).json(),
    )
    await app.inject({
      method: "PATCH",
      url: `/api/items/${created.id}`,
      payload: { expectedVersion: created.version, title: "新版本" },
    })

    // When
    const stale = await app.inject({
      method: "PATCH",
      url: `/api/items/${created.id}`,
      payload: { expectedVersion: created.version, title: "旧覆盖" },
    })

    // Then
    expect(malformed.statusCode).toBe(400)
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({
      code: "ITEM_VERSION_CONFLICT",
      entityId: created.id,
      currentVersion: 2,
    })
  })
})
