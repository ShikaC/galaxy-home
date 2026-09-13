import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getSettings } from "../../src/server/repositories/settings.js"
import { buildAiContext } from "../../src/server/services/aiContext.js"
import { createManualExport, restoreManualExport } from "../../src/server/services/backup.js"
import { noteSchema, notesSchema } from "../../src/shared/notes.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-notes-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  const app = await buildApp({
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: join(directory, "secrets.json"),
  })
  return { app, database, directory }
}

describe("workspace notebook", () => {
  it("persists edits, preserves omitted fields, searches and archives notes with AI context", async () => {
    const { app, database } = await setup()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/notes",
        payload: { title: "信息架构研究", content: "研究如何把知识连接成行动。", pinned: true },
      })
      expect(response.statusCode).toBe(201)
      const note = noteSchema.parse(response.json())
      const edited = await app.inject({
        method: "PATCH",
        url: `/api/notes/${note.id}`,
        payload: { title: "知识连接研究" },
      })
      expect(noteSchema.parse(edited.json())).toMatchObject({
        content: note.content,
        pinned: true,
        title: "知识连接研究",
      })
      const search = await app.inject({ url: "/api/search?q=知识连接&type=note" })
      expect(search.json()).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "note", id: note.id })]),
      )
      const settings = getSettings(database)
      const context = buildAiContext(
        database,
        { ...settings, aiPermission: "open" },
        "/notes",
        "知识笔记",
        "知识连接",
      )
      expect(context.references).toContainEqual({
        type: "note",
        id: note.id,
        label: "知识连接研究",
      })
      const conservative = buildAiContext(
        database,
        { ...settings, aiPermission: "conservative" },
        "/notes",
        "知识笔记",
        "知识连接",
      )
      expect(conservative.references.some((reference) => reference.type === "note")).toBe(false)
      await app.inject({
        method: "PATCH",
        url: `/api/notes/${note.id}`,
        payload: { archived: true },
      })
      expect(notesSchema.parse((await app.inject({ url: "/api/notes" })).json())).toHaveLength(0)
      expect(
        notesSchema.parse((await app.inject({ url: "/api/notes?archived=true" })).json()),
      ).toHaveLength(1)
      expect((await app.inject({ url: "/api/search?q=知识连接" })).json()).toEqual([])
      await app.inject({
        method: "PATCH",
        url: `/api/notes/${note.id}`,
        payload: { archived: false },
      })
      expect(notesSchema.parse((await app.inject({ url: "/api/notes" })).json())[0]?.content).toBe(
        note.content,
      )
    } finally {
      await app.close()
      database.close()
    }
  })
  it("validates inputs and reports missing notes without changing stored documents", async () => {
    const { app, database } = await setup()
    try {
      expect(
        (await app.inject({ method: "POST", url: "/api/notes", payload: { title: "   " } }))
          .statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/notes",
            payload: { title: "大文档", content: "x".repeat(50_001) },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/notes/20a2a356-d372-4bd7-bf8f-d8e1a4cd4527",
            payload: { title: "不存在" },
          })
        ).statusCode,
      ).toBe(404)
    } finally {
      await app.close()
      database.close()
    }
  })
  it("round trips notebook backups and accepts pre-notebook exports", async () => {
    const { app, database, directory } = await setup()
    try {
      await app.inject({
        method: "POST",
        url: "/api/notes",
        payload: { title: "长期保存的想法", content: "我的资料" },
      })
      const exported = createManualExport(database)
      database.exec("DELETE FROM workspace_notes")
      await restoreManualExport(database, exported, join(directory, "backups"))
      expect(notesSchema.parse((await app.inject({ url: "/api/notes" })).json())[0]?.content).toBe(
        "我的资料",
      )
      const payload = unzipSync(exported)["galaxy-home.json"]
      if (!payload) throw new Error("Missing export")
      const legacy = z
        .object({
          schemaVersion: z.literal(2),
          exportedAt: z.string(),
          tables: z.record(z.string(), z.unknown()),
        })
        .parse(JSON.parse(strFromU8(payload)))
      delete legacy.tables["workspace_notes"]
      await restoreManualExport(
        database,
        zipSync({ "galaxy-home.json": strToU8(JSON.stringify(legacy)) }),
        join(directory, "backups"),
      )
      expect(notesSchema.parse((await app.inject({ url: "/api/notes" })).json())).toHaveLength(0)
    } finally {
      await app.close()
      database.close()
    }
  })
})
