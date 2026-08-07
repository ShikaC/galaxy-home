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

describe("project resume workflow", () => {
  it("reconfirms the current stage with AI when a paused project resumes", async () => {
    aiServer = createServer(async (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ questions: ["当前阶段还准确吗？"] }) } },
          ],
        }),
      )
    })
    await new Promise<void>((resolve) => aiServer?.listen(0, "127.0.0.1", resolve))
    const address = aiServer.address()
    if (address === null || typeof address === "string") throw new Error("AI test server failed")

    directory = mkdtempSync(join(tmpdir(), "galaxy-project-resume-ai-"))
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
    const project = createProject(database, {
      name: "整理书房",
      desiredOutcome: "可以安心阅读",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "清理桌面",
      currentTask: "移走旧文件",
      nextTask: "擦净桌面",
    })
    app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath,
    })

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { status: "paused" },
    })
    const resumed = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/resume`,
    })

    expect(resumed.statusCode).toBe(200)
    expect(resumed.json()).toEqual(expect.objectContaining({ id: project.id, status: "active" }))
    const session = await app.inject({ method: "GET", url: `/api/projects/${project.id}/ai` })
    expect(session.json()).toEqual(
      expect.objectContaining({ status: "clarifying", currentQuestion: "当前阶段还准确吗？" }),
    )
  })

  it("keeps a paused project paused when AI reconfirmation is unavailable", async () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-project-resume-error-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const secretPath = join(directory, "secrets.json")
    await writeSecretConfig(secretPath, {
      chatBaseUrl: "http://127.0.0.1:1/v1",
      chatModel: "test-model",
      apiKey: "test-key",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    })
    const project = createProject(database, {
      name: "整理书房",
      desiredOutcome: "可以安心阅读",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "清理桌面",
      currentTask: "移走旧文件",
      nextTask: "擦净桌面",
    })
    app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath,
    })

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { status: "paused" },
    })
    const resumed = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/resume`,
    })

    expect(resumed.statusCode).toBe(503)
    const unchanged = await app.inject({ method: "GET", url: `/api/projects/${project.id}` })
    expect(unchanged.json()).toEqual(expect.objectContaining({ status: "paused" }))
  })
})
