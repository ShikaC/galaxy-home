// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { z } from "zod"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function setup(proposal: unknown) {
  let calls = 0
  const model = createServer(async (request, response) => {
    for await (const _chunk of request) {
    }
    calls += 1
    response.setHeader("content-type", "application/json")
    response.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(proposal) } }],
        usage: { prompt_tokens: 120, completion_tokens: 80 },
      }),
    )
  })
  await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve))
  cleanups.push(() => new Promise<void>((resolve) => model.close(() => resolve())))
  const address = model.address()
  if (address === null || typeof address === "string") throw new Error("Missing model port")
  const directory = mkdtempSync(join(tmpdir(), "galaxy-planning-"))
  const database = openDatabase(join(directory, "db.sqlite"))
  migrateDatabase(database)
  const secretPath = join(directory, "secrets.json")
  await writeSecretConfig(secretPath, {
    chatBaseUrl: `http://127.0.0.1:${address.port}/v1`,
    chatModel: "fixture-model",
    apiKey: "test-key",
    transcriptionBaseUrl: "",
    transcriptionModel: "",
  })
  const context = {
    database,
    secretPath,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
  }
  const app = await buildApp(context)
  cleanups.push(async () => {
    await app.close()
    database.close()
    rmSync(directory, { recursive: true, force: true })
  })
  return { app, database, context, calls: () => calls }
}
const request = () => ({
  requestId: crypto.randomUUID(),
  goal: "整理作品集，先完成案例提纲",
  startDate: "2026-09-10",
  horizonDays: 1,
  dailyMinutes: 45,
  contextMode: "goal_only",
})
const proposal = {
  summary: "先完成一个可检查的提纲。",
  clarification: null,
  tasks: [
    {
      title: "整理作品集案例提纲",
      minutes: 25,
      dayOffset: 0,
      reason: "产出一份可编辑的提纲",
      sourceIds: [],
      existingItemId: null,
    },
  ],
}
const runSchema = z.object({
  id: z.string(),
  status: z.string(),
  error: z.object({ code: z.string() }).nullable(),
  results: z.array(z.object({ itemId: z.string(), disposition: z.string() })),
  attempts: z.array(z.object({ inputTokens: z.number().nullable() })),
})

it("requires confirmation, persists telemetry and executes exactly once across duplicate requests", async () => {
  const { app, database, calls } = await setup(proposal)
  const input = request()
  const result = await app.inject({ method: "POST", url: "/api/plans", payload: input })
  expect(result.statusCode).toBe(201)
  const run = runSchema.parse(result.json())
  expect(run.status).toBe("awaiting_confirmation")
  expect(database.prepare("SELECT id FROM items").all()).toHaveLength(0)
  expect(run.attempts[0]?.inputTokens).toBe(120)
  expect((await app.inject({ method: "POST", url: "/api/plans", payload: input })).json().id).toBe(
    run.id,
  )
  expect(calls()).toBe(1)
  for (let i = 0; i < 2; i++) {
    const executed = await app.inject({ method: "POST", url: `/api/plans/${run.id}/confirm` })
    expect(executed.statusCode).toBe(200)
    expect(runSchema.parse(executed.json()).status).toBe("succeeded")
  }
  expect(database.prepare("SELECT id FROM items").all()).toHaveLength(1)
  expect(
    database.prepare("SELECT item_id FROM today_items WHERE local_date = '2026-09-10'").all(),
  ).toHaveLength(1)
})
it("fails closed on impossible budgets and foreign references without mutations", async () => {
  const { app, database } = await setup({
    ...proposal,
    tasks: [{ ...proposal.tasks[0], minutes: 80, sourceIds: [crypto.randomUUID()] }],
  })
  const response = await app.inject({ method: "POST", url: "/api/plans", payload: request() })
  const run = runSchema.parse(response.json())
  expect(run.status).toBe("failed")
  expect(run.error?.code).toBe("INVALID_PLAN")
  expect(database.prepare("SELECT id FROM items").all()).toHaveLength(0)
  expect(
    (await app.inject({ method: "POST", url: `/api/plans/${run.id}/confirm` })).statusCode,
  ).toBe(409)
})
it("blocks knowledge access under conservative permissions before calling the provider", async () => {
  const { app, calls } = await setup(proposal)
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/plans",
        payload: { ...request(), contextMode: "workspace" },
      })
    ).statusCode,
  ).toBe(409)
  expect(calls()).toBe(0)
})
it("reuses a matching task created after planning and keeps cancellation terminal", async () => {
  const { app, database } = await setup(proposal)
  const run = runSchema.parse(
    (await app.inject({ method: "POST", url: "/api/plans", payload: request() })).json(),
  )
  const item = await app.inject({
    method: "POST",
    url: "/api/items",
    payload: { title: "整理作品集案例提纲" },
  })
  expect(item.statusCode).toBe(201)
  const executed = runSchema.parse(
    (await app.inject({ method: "POST", url: `/api/plans/${run.id}/confirm` })).json(),
  )
  expect(executed.results[0]?.disposition).toBe("reused")
  expect(database.prepare("SELECT id FROM items").all()).toHaveLength(1)
  const next = runSchema.parse(
    (await app.inject({ method: "POST", url: "/api/plans", payload: request() })).json(),
  )
  expect(
    (await app.inject({ method: "POST", url: `/api/plans/${next.id}/cancel` })).statusCode,
  ).toBe(200)
  expect(
    (await app.inject({ method: "POST", url: `/api/plans/${next.id}/confirm` })).statusCode,
  ).toBe(409)
})
