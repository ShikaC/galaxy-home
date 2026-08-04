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

describe("project AI workflow", () => {
  it("clarifies one question at a time, previews a plan, and adjusts work from feedback", async () => {
    const requests: unknown[] = []
    const responses = [
      { questions: ["什么样算搬家完成？", "现在最大的不确定是什么？"] },
      {
        stageTitle: "确认搬家范围",
        currentTask: "列出必须搬走的物品",
        nextTask: "确认搬家日期",
        progress: 15,
      },
      { kind: "task", nextTask: "联系两家搬运公司", progress: 30 },
      { questions: [] },
      { questions: ["现在最需要重新确认什么？"] },
      {
        stageTitle: "重新确认范围",
        currentTask: "核对搬家清单",
        nextTask: "确认最终日期",
        progress: 35,
      },
    ]
    let responseIndex = 0
    aiServer = createServer(async (request, response) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of request) {
        if (typeof chunk === "string") chunks.push(Buffer.from(chunk))
        else chunks.push(chunk)
      }
      requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      const payload = responses[responseIndex]
      responseIndex += 1
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }))
    })
    await new Promise<void>((resolve) => aiServer?.listen(0, "127.0.0.1", resolve))
    const address = aiServer.address()
    if (address === null || typeof address === "string") throw new Error("AI test server failed")

    directory = mkdtempSync(join(tmpdir(), "galaxy-project-ai-"))
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
      desiredOutcome: "顺利入住新家",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "手动草稿",
      currentTask: "先想一想",
      nextTask: "再说",
    })
    app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath,
    })

    const started = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/start`,
    })
    expect(started.json()).toEqual(
      expect.objectContaining({
        currentQuestion: "什么样算搬家完成？",
        answeredCount: 0,
        totalQuestions: 2,
      }),
    )
    const firstAnswer = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/answer`,
      payload: { answer: "所有箱子运到并归位" },
    })
    expect(firstAnswer.json()).toEqual(
      expect.objectContaining({ currentQuestion: "现在最大的不确定是什么？", answeredCount: 1 }),
    )
    expect(responseIndex).toBe(1)
    const planned = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/answer`,
      payload: { answer: "还没确定搬家日期" },
    })
    expect(planned.json()).toEqual(
      expect.objectContaining({
        status: "ready",
        draft: expect.objectContaining({ currentTask: "列出必须搬走的物品" }),
      }),
    )
    const applied = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/apply`,
    })
    expect(applied.json()).toEqual(
      expect.objectContaining({
        currentTask: expect.objectContaining({ source: "ai", title: "列出必须搬走的物品" }),
        nextTask: expect.objectContaining({ source: "ai", title: "确认搬家日期" }),
        progress: 15,
        progressSource: "ai",
      }),
    )
    const recommended = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/current-task/today`,
      payload: { localDate: "2026-08-04" },
    })
    expect(recommended.statusCode).toBe(201)
    expect(recommended.json()).toEqual(
      expect.objectContaining({
        title: "列出必须搬走的物品",
        inToday: true,
        projectIds: [project.id],
      }),
    )
    const recommendedAgain = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/current-task/today`,
      payload: { localDate: "2026-08-04" },
    })
    expect(recommendedAgain.json()).toEqual(expect.objectContaining({ id: recommended.json().id }))
    const feedback = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/feedback`,
      payload: { outcome: "清单已完成", obstacle: "物品比预期多" },
    })
    expect(feedback.json()).toEqual(
      expect.objectContaining({
        currentTask: expect.objectContaining({ title: "确认搬家日期" }),
        nextTask: expect.objectContaining({ source: "ai", title: "联系两家搬运公司" }),
        progress: 30,
        progressSource: "ai",
      }),
    )
    const invalidRestart = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/start`,
    })
    expect(invalidRestart.statusCode).toBe(503)
    expect(invalidRestart.json()).toEqual(expect.objectContaining({ code: "AI_INVALID_RESPONSE" }))
    const preserved = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/ai`,
    })
    expect(preserved.json()).toEqual(expect.objectContaining({ status: "applied" }))

    await app.inject({ method: "POST", url: `/api/projects/${project.id}/ai/start` })
    const staleDraft = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/answer`,
      payload: { answer: "搬家日期有变化" },
    })
    expect(staleDraft.json()).toEqual(expect.objectContaining({ status: "ready" }))
    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { notes: "这是用户刚刚补充的事实" },
    })
    const staleApply = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/ai/apply`,
    })
    expect(staleApply.statusCode).toBe(409)
    expect(staleApply.json()).toEqual(expect.objectContaining({ code: "PROJECT_AI_STALE" }))
    const manuallyUpdated = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}`,
    })
    expect(manuallyUpdated.json()).toEqual(
      expect.objectContaining({
        notes: "这是用户刚刚补充的事实",
        currentTask: expect.objectContaining({ title: "确认搬家日期" }),
      }),
    )
    expect(requests).toHaveLength(6)
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ response_format: { type: "json_object" } }),
      ]),
    )
  })
})
