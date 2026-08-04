import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createProject } from "../../src/server/repositories/projects.js"
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

describe("AI assistant context and memory", () => {
  it("limits conservative context, discloses open references, and saves only confirmed memory", async () => {
    const requests: unknown[] = []
    aiServer = createServer(async (request, response) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of request) {
        if (typeof chunk === "string") chunks.push(Buffer.from(chunk))
        else chunks.push(chunk)
      }
      requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(
        JSON.stringify({
          choices: [
            { message: { content: requests.length === 3 ? "   " : "先把下一步缩小一点。" } },
          ],
        }),
      )
    })
    await new Promise<void>((resolve) => aiServer?.listen(0, "127.0.0.1", resolve))
    const address = aiServer.address()
    if (address === null || typeof address === "string") throw new Error("AI test server failed")

    directory = mkdtempSync(join(tmpdir(), "galaxy-ai-assistant-"))
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
    const project = createProject(database, {
      name: "准备搬家",
      desiredOutcome: "九月底住进新家",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "确认范围",
      currentTask: "列物品清单",
      nextTask: "确认日期",
    })
    database
      .prepare(
        `INSERT INTO items (id, title, status, created_at, updated_at)
         VALUES (?, '预约搬家车辆', 'active', ?, ?)`,
      )
      .run(crypto.randomUUID(), new Date().toISOString(), new Date().toISOString())
    app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath,
    })

    const conservative = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "我卡住了",
        currentPath: `/projects/${project.id}`,
        currentLabel: "项目",
      },
    })
    expect(conservative.statusCode).toBe(200)
    expect(conservative.json()).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          references: expect.arrayContaining([
            expect.objectContaining({ type: "project", id: project.id, label: "准备搬家" }),
          ]),
        }),
      }),
    )
    expect(JSON.stringify(requests[0])).toContain("九月底住进新家")
    expect(JSON.stringify(requests[0])).not.toContain("预约搬家车辆")

    const rejectedMemory = await app.inject({
      method: "POST",
      url: "/api/ai/memories",
      payload: { content: "搬家时我偏好上午处理复杂任务", kind: "preference", confirmed: false },
    })
    expect(rejectedMemory.statusCode).toBe(400)
    const memory = await app.inject({
      method: "POST",
      url: "/api/ai/memories",
      payload: { content: "搬家时我偏好上午处理复杂任务", kind: "preference", confirmed: true },
    })
    expect(memory.statusCode).toBe(201)
    expect(memory.json()).toEqual(
      expect.objectContaining({ content: "搬家时我偏好上午处理复杂任务", kind: "preference" }),
    )

    await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { aiPermission: "open" },
    })
    const open = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: conservative.json().conversationId,
        content: "上午搬家还有什么遗漏？",
        currentPath: "/",
        currentLabel: "首页",
      },
    })
    expect(open.json()).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          references: expect.arrayContaining([
            expect.objectContaining({ type: "item", label: "预约搬家车辆" }),
            expect.objectContaining({ type: "memory", label: "搬家时我偏好上午处理复杂任务" }),
          ]),
        }),
      }),
    )
    expect(JSON.stringify(requests[1])).toContain("预约搬家车辆")
    expect(JSON.stringify(requests[1])).toContain("搬家时我偏好上午处理复杂任务")
    const storedReferences = database
      .prepare(
        "SELECT references_json FROM ai_messages WHERE role = 'assistant' ORDER BY created_at",
      )
      .all()
    expect(storedReferences).toHaveLength(2)
    expect(JSON.stringify(storedReferences[1])).toContain("预约搬家车辆")

    const conversationCountBefore = Number(
      database.prepare("SELECT COUNT(*) AS value FROM ai_conversations").get()?.["value"],
    )
    const messageCountBefore = Number(
      database.prepare("SELECT COUNT(*) AS value FROM ai_messages").get()?.["value"],
    )
    const blank = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "请帮我开始",
        currentPath: "/",
        currentLabel: "首页",
      },
    })
    expect(blank.statusCode).toBe(503)
    expect(blank.json()).toEqual(expect.objectContaining({ code: "AI_INVALID_RESPONSE" }))
    expect(
      Number(database.prepare("SELECT COUNT(*) AS value FROM ai_conversations").get()?.["value"]),
    ).toBe(conversationCountBefore)
    expect(
      Number(database.prepare("SELECT COUNT(*) AS value FROM ai_messages").get()?.["value"]),
    ).toBe(messageCountBefore)
  })
})
