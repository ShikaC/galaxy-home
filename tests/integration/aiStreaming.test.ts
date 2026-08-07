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

describe("AI streaming chat", () => {
  it("forwards SSE deltas and persists the completed assistant message", async () => {
    aiServer = createServer(async (request, response) => {
      for await (const _chunk of request) {
        // Consume the request before opening the response.
      }
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      })
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "先把" } }] })}\n\n`)
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "下一步缩小。" } }] })}\n\n`,
      )
      response.end("data: [DONE]\n\n")
    })
    await new Promise<void>((resolve) => aiServer?.listen(0, "127.0.0.1", resolve))
    const address = aiServer.address()
    if (address === null || typeof address === "string") throw new Error("AI test server failed")

    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-streaming-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const secretPath = join(directory, "secrets.json")
    await writeSecretConfig(secretPath, {
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

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat/stream",
      payload: {
        conversationId: null,
        content: "我卡住了",
        currentPath: "/",
        currentLabel: "首页",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/event-stream")
    expect(response.body).toContain('"type":"delta"')
    expect(response.body).toContain('"content":"先把"')
    expect(response.body).toContain('"type":"done"')
    expect(response.body).toContain("下一步缩小。")
    expect(
      database.prepare("SELECT content FROM ai_messages WHERE role = 'assistant'").all(),
    ).toEqual([expect.objectContaining({ content: "先把下一步缩小。" })])
  })
})
