// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createManualExport, restoreManualExport } from "../../src/server/services/backup.js"
import { cancelPlan, executePlan } from "../../src/server/services/planning/execute.js"
import { generatePlan, type PlanningModel } from "../../src/server/services/planning/generate.js"
import { fingerprint } from "../../src/server/services/planning/retrieval.js"
import {
  readPlan,
  recoverInterruptedPlans,
  savePlan,
} from "../../src/server/services/planning/store.js"
import type { PlanInput, PlanRun } from "../../src/shared/planning.js"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-plan-recovery-"))
  const database = openDatabase(join(directory, "db.sqlite"))
  migrateDatabase(database)
  cleanups.push(() => {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  })
  return {
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: join(directory, "secrets.json"),
  }
}
const input = (): PlanInput => ({
  requestId: crypto.randomUUID(),
  goal: "完成作品集案例提纲",
  dailyMinutes: 45,
  horizonDays: 1,
  startDate: "2026-09-10",
  contextMode: "goal_only",
})
const task = (title: string) => ({
  title,
  minutes: 20,
  dayOffset: 0,
  reason: "产出案例提纲",
  sourceIds: [],
  existingItemId: null,
})
const model: PlanningModel = async () => ({
  content: JSON.stringify({
    summary: "先整理，再检查",
    clarification: null,
    tasks: [task("编写提纲"), task("检查提纲")],
  }),
  model: "fixture",
  durationMs: 1,
  inputTokens: null,
  outputTokens: null,
})
it("rolls back the entire batch on write failure and safely retries the same plan", async () => {
  const context = setup()
  const run = await generatePlan(context, input(), model)
  context.database.exec(
    "CREATE TRIGGER fail_second BEFORE INSERT ON items WHEN NEW.title = '检查提纲' BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
  )
  const failed = executePlan(context, run.id)
  expect(failed.error?.code).toBe("EXECUTION_FAILED")
  expect(context.database.prepare("SELECT * FROM items").all()).toHaveLength(0)
  expect(context.database.prepare("SELECT * FROM today_items").all()).toHaveLength(0)
  context.database.exec("DROP TRIGGER fail_second")
  expect(executePlan(context, run.id).status).toBe("succeeded")
  expect(executePlan(context, run.id).results).toHaveLength(2)
  expect(context.database.prepare("SELECT * FROM items").all()).toHaveLength(2)
})
it.each(["content", "archived", "permission"])(
  "rejects confirmation after %s changes",
  async (change) => {
    const context = setup()
    context.database.exec("UPDATE workspace_settings SET ai_permission = 'open'")
    context.database
      .prepare(
        "INSERT INTO workspace_notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(crypto.randomUUID(), "作品集案例", "需要先写案例提纲", "2026-09-10", "2026-09-10")
    const run = await generatePlan(context, { ...input(), contextMode: "workspace" }, model)
    expect(run.sources).toHaveLength(1)
    if (change === "content")
      context.database.exec("UPDATE workspace_notes SET content = '新的方向'")
    if (change === "archived") context.database.exec("UPDATE workspace_notes SET archived = 1")
    if (change === "permission")
      context.database.exec("UPDATE workspace_settings SET ai_permission = 'conservative'")
    expect(() => executePlan(context, run.id)).toThrow()
    expect(readPlan(context.database, run.id).status).toBe("failed")
    expect(context.database.prepare("SELECT * FROM items").all()).toHaveLength(0)
  },
)
it("preserves cancellation while a model request is outstanding", async () => {
  const context = setup()
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const request = input()
  const generating = generatePlan(context, request, async (messages) => {
    await waiting
    return model(messages)
  })
  expect(readPlan(context.database, request.requestId).status).toBe("planning")
  cancelPlan(context, request.requestId)
  release?.()
  expect((await generating).status).toBe("cancelled")
  expect(() => executePlan(context, request.requestId)).toThrow()
})
it("recovers an interrupted generation and retains confirmed runs across export/restore", async () => {
  const context = setup()
  const run = await generatePlan(context, input(), model)
  savePlan(context.database, { ...run, status: "planning", proposal: null })
  context.database.exec("UPDATE plan_runs SET owner_pid = 0")
  recoverInterruptedPlans(context.database)
  expect(readPlan(context.database, run.id).error?.code).toBe("INTERRUPTED")
  const ready = await generatePlan(context, input(), model)
  executePlan(context, ready.id)
  const exported = createManualExport(context.database)
  context.database.exec("DELETE FROM plan_runs")
  await restoreManualExport(context.database, exported, context.backupDirectory)
  expect(executePlan(context, ready.id).status).toBe("succeeded")
  expect(context.database.prepare("SELECT * FROM items").all()).toHaveLength(2)
})
it("uses a bounded repair and records invalid as well as accepted model attempts", async () => {
  const context = setup()
  let calls = 0
  const run = await generatePlan(context, input(), async (messages) => {
    calls += 1
    if (calls === 1) return { ...(await model(messages)), content: "not JSON" }
    return model(messages)
  })
  expect(run.status).toBe("awaiting_confirmation")
  expect(run.attempts.map((attempt) => attempt.outcome)).toEqual(["invalid", "accepted"])
  expect(calls).toBe(2)
})
it("requires clarification without giving it mutation authority", async () => {
  const context = setup()
  const run = await generatePlan(context, input(), async (messages) => ({
    ...(await model(messages)),
    content: JSON.stringify({
      summary: "目标需要明确",
      clarification: "希望完成什么成果？",
      tasks: [],
    }),
  }))
  expect(run.status).toBe("needs_input")
  expect(() => executePlan(context, run.id)).toThrow()
})
it("places overflow on secondary without displacing existing focus and rejects changed reused items", async () => {
  const context = setup()
  const first = await generatePlan(context, input(), model)
  const result = executePlan(context, first.id)
  const one = result.results[0]
  if (one === undefined) throw new Error("Missing execution result")
  context.database.prepare("UPDATE today_items SET is_focus = 1 WHERE item_id = ?").run(one.itemId)
  const next = await generatePlan(context, input(), async (messages) => ({
    ...(await model(messages)),
    content: JSON.stringify({
      summary: "补充任务",
      clarification: null,
      tasks: [task("整理来源"), task("完成检查")],
    }),
  }))
  expect(executePlan(context, next.id).results.map((item) => item.secondary)).toEqual([false, true])
  expect(
    context.database.prepare("SELECT item_id FROM today_items WHERE is_focus = 1").get(),
  ).toEqual({ item_id: one.itemId })
  const base = await generatePlan(context, input(), model)
  const itemRow = context.database
    .prepare("SELECT id, title, notes, status, deleted_at FROM items WHERE id = ?")
    .get(one.itemId)
  const stale: PlanRun = {
    ...base,
    existingItems: [{ id: one.itemId, title: one.title, fingerprint: fingerprint(itemRow) }],
    proposal: {
      summary: "复用",
      clarification: null,
      tasks: [{ ...task(one.title), existingItemId: one.itemId }],
    },
  }
  savePlan(context.database, stale)
  context.database.prepare("UPDATE items SET status = 'completed' WHERE id = ?").run(one.itemId)
  expect(() => executePlan(context, base.id)).toThrow("任务已发生变化")
})

it("rejects corrupt or mismatched imported run state before changing existing data", async () => {
  const { strFromU8, strToU8, unzipSync, zipSync } = await import("fflate")
  const { z } = await import("zod")
  const context = setup()
  const run = await generatePlan(context, input(), model)
  const exported = unzipSync(createManualExport(context.database))["galaxy-home.json"]
  if (exported === undefined) throw new Error("Missing export")
  const archive = z
    .object({
      schemaVersion: z.literal(2),
      exportedAt: z.string(),
      tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    })
    .parse(JSON.parse(strFromU8(exported)))
  for (const corrupt of ["{}", JSON.stringify({ ...run, id: crypto.randomUUID() })]) {
    const bytes = zipSync({
      "galaxy-home.json": strToU8(
        JSON.stringify({
          ...archive,
          tables: {
            ...archive.tables,
            plan_runs: [
              {
                id: run.id,
                state_json: corrupt,
                created_at: run.createdAt,
                updated_at: run.updatedAt,
              },
            ],
          },
        }),
      ),
    })
    await expect(
      restoreManualExport(context.database, bytes, context.backupDirectory),
    ).rejects.toMatchObject({ name: "ImportArchiveMalformedError" })
    expect(readPlan(context.database, run.id)).toEqual(run)
  }
})
