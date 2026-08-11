// @vitest-environment node

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

describe("AI action protocol recovery", () => {
  it("retries one malformed action response before persisting it", async () => {
    let requestCount = 0
    aiServer = createServer(async (request, response) => {
      for await (const _chunk of request) {
      }
      requestCount += 1
      const content =
        requestCount === 1
          ? `先处理一下。\n\n\`\`\`json\n{"action":"not_an_action"}\n\`\`\``
          : `好的。\n\n\`\`\`json\n{"action":"create_item","title":"重试后待办"}\n\`\`\``
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ choices: [{ message: { content } }] }))
    })
    await new Promise<void>((resolve) => aiServer?.listen(0, "127.0.0.1", resolve))
    const address = aiServer.address()
    if (address === null || typeof address === "string") throw new Error("AI test server failed")

    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-retry-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database.prepare("UPDATE workspace_settings SET ai_permission = 'open'").run()
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

    const result = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我记下重试后待办",
        currentPath: "/todos",
        currentLabel: "待办",
      },
    })

    expect(result.statusCode).toBe(200)
    expect(requestCount).toBe(2)
    expect(result.json().message.content).toContain("已实际创建待办「重试后待办」")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("重试后待办") as { value: number }
      ).value,
    ).toBe(1)
  })
})
