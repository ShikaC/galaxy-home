import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { purgeExpiredTrash } from "../../src/server/repositories/trash.js"

let app: FastifyInstance | undefined
let database: DatabaseSync | undefined
let directory = ""

afterEach(async () => {
  if (app !== undefined) await app.close()
  database?.close()
  if (directory !== "") rmSync(directory, { force: true, recursive: true })
  app = undefined
  database = undefined
  directory = ""
})

describe("trash lifecycle", () => {
  it("restores related data, permanently deletes on confirmation, and purges expired entries", async () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-trash-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })
    const category = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: "生活", color: "#4f7a65", icon: "home" },
    })
    const categoryId = category.json<{ id: string }>().id
    const item = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "预约洗衣", categoryIds: [categoryId], projectIds: [] },
    })
    const itemId = item.json<{ id: string }>().id

    await app.inject({ method: "DELETE", url: `/api/items/${itemId}` })
    const deleted = await app.inject({ method: "GET", url: "/api/trash" })
    const trashId = deleted.json<readonly { id: string; display_name: string }[]>()[0]?.id
    expect(deleted.json()).toEqual([
      expect.objectContaining({ entity_type: "item", display_name: "预约洗衣" }),
    ])
    expect(trashId).toBeDefined()
    if (trashId === undefined) throw new Error("trash entry missing")

    await app.inject({ method: "POST", url: `/api/trash/${trashId}/restore` })
    const restored = await app.inject({
      method: "GET",
      url: `/api/items?view=active&localDate=2026-08-04&categoryId=${categoryId}`,
    })
    expect(restored.json()).toEqual([expect.objectContaining({ id: itemId, title: "预约洗衣" })])

    await app.inject({ method: "DELETE", url: `/api/items/${itemId}` })
    const secondTrash = await app.inject({ method: "GET", url: "/api/trash" })
    const secondTrashId = secondTrash.json<readonly { id: string }[]>()[0]?.id
    if (secondTrashId === undefined) throw new Error("second trash entry missing")
    await app.inject({ method: "DELETE", url: `/api/trash/${secondTrashId}` })
    expect(database.prepare("SELECT id FROM items WHERE id = ?").get(itemId)).toBeUndefined()

    const expiring = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "到期清理", categoryIds: [], projectIds: [] },
    })
    const expiringId = expiring.json<{ id: string }>().id
    await app.inject({ method: "DELETE", url: `/api/items/${expiringId}` })
    database
      .prepare("UPDATE trash_entries SET purge_after = ? WHERE entity_id = ?")
      .run("2026-08-03T00:00:00.000Z", expiringId)

    expect(purgeExpiredTrash(database, new Date("2026-08-04T00:00:00.000Z"))).toBe(1)
    expect(database.prepare("SELECT id FROM items WHERE id = ?").get(expiringId)).toBeUndefined()
  })
})
