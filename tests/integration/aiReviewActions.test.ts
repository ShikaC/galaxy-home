import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

let app: FastifyInstance | undefined
let database: DatabaseSync | undefined
let aiServer: Server | undefined
let directory = ""

afterEach(async () => {
  if (app !== undefined) await app.close()
  database?.close()
  if (aiServer !== undefined) await new Promise<void>((resolve) => aiServer?.close(() => resolve()))
  if (directory !== "") rmSync(directory, { force: true, recursive: true })
  app = undefined
  database = undefined
  aiServer = undefined
  directory = ""
})

describe("AI weekly review actions", () => {
  it("requires conservative confirmation, records reversible actions, and rejects invalid output", async () => {
    const responses = [
      {
        summary: "本周完成了搬家准备，也看见了精力不足的阻碍。",
        obstacles: ["晚间精力下降"],
        suggestions: [{ type: "item", content: "上午确认搬家日期" }],
      },
      { summary: 42 },
      {
        summary: "新一周可以从一个短动作开始。",
        obstacles: [],
        suggestions: [{ type: "habit", content: "每天整理十分钟" }],
      },
    ]
    let responseIndex = 0
    aiServer = createServer(async (request, response) => {
      for await (const _chunk of request) {
        void _chunk
      }
      const payload = responses[responseIndex]
      responseIndex += 1
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }))
    })
    await new Promise<void>((resolve) => aiServer?.listen(0, "127.0.0.1", resolve))
    const address = aiServer.address()
    if (address === null || typeof address === "string") throw new Error("AI test server failed")

    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-review-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const secretPath = join(directory, "secrets.json")
    writeSecretConfig(secretPath, {
      chatBaseUrl: `http://127.0.0.1:${address.port}/v1`,
      chatModel: "test-model",
      apiKey: "test-key",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    })
    app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath,
    })

    const needsConfirmation = await app.inject({
      method: "POST",
      url: "/api/reviews/generate-ai",
      payload: { weekStart: "2026-07-27", weekEnd: "2026-08-02", confirmed: false },
    })
    expect(needsConfirmation.statusCode).toBe(409)
    expect(responseIndex).toBe(0)
    const generated = await app.inject({
      method: "POST",
      url: "/api/reviews/generate-ai",
      payload: { weekStart: "2026-07-27", weekEnd: "2026-08-02", confirmed: true },
    })
    expect(generated.json()).toEqual(
      expect.objectContaining({ source: "ai", summary: expect.stringContaining("搬家准备") }),
    )
    const actions = await app.inject({ method: "GET", url: "/api/ai/actions" })
    expect(actions.json()).toEqual([
      expect.objectContaining({
        actionType: "generate_weekly_review",
        entityType: "review",
        undoneAt: null,
      }),
    ])

    const invalid = await app.inject({
      method: "POST",
      url: "/api/reviews/generate-ai",
      payload: { weekStart: "2026-07-27", weekEnd: "2026-08-02", confirmed: true },
    })
    expect(invalid.statusCode).toBe(503)
    const preserved = await app.inject({ method: "GET", url: "/api/reviews" })
    expect(preserved.json()).toEqual([
      expect.objectContaining({ summary: "本周完成了搬家准备，也看见了精力不足的阻碍。" }),
    ])
    expect((await app.inject({ method: "GET", url: "/api/ai/actions" })).json()).toHaveLength(1)

    const actionId = actions.json<readonly { id: string }[]>()[0]?.id
    if (actionId === undefined) throw new Error("Missing AI action")
    expect(
      (await app.inject({ method: "POST", url: `/api/ai/actions/${actionId}/undo` })).statusCode,
    ).toBe(204)
    expect((await app.inject({ method: "GET", url: "/api/reviews" })).json()).toEqual([])

    await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { aiPermission: "open" },
    })
    const openMode = await app.inject({
      method: "POST",
      url: "/api/reviews/generate-ai",
      payload: { weekStart: "2026-08-03", weekEnd: "2026-08-09", confirmed: false },
    })
    expect(openMode.statusCode).toBe(201)
    expect(openMode.json()).toEqual(expect.objectContaining({ source: "ai" }))
  })
})
