// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { cancelPlan, executePlan } from "../../src/server/services/planning/execute.js"
import { generatePlan, type PlanningModel } from "../../src/server/services/planning/generate.js"
import { readPlan, recoverInterruptedPlans } from "../../src/server/services/planning/store.js"
import type { PlanInput } from "../../src/shared/planning.js"

const cleanups: (() => void)[] = []
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0)) cleanup()
})
it("preserves cancellation committed immediately after an execution rollback", async () => {
  const { context, other } = setup()
  const run = await generatePlan(context, input(), model)
  context.database.exec(
    "CREATE TRIGGER fail_plan_write BEFORE INSERT ON today_items BEGIN SELECT RAISE(ABORT, 'write failed'); END",
  )
  const exec = context.database.exec.bind(context.database)
  let raced = false
  vi.spyOn(context.database, "exec").mockImplementation((sql) => {
    exec(sql)
    if (sql === "ROLLBACK" && !raced) {
      raced = true
      cancelPlan(other, run.id)
    }
  })
  expect(executePlan(context, run.id).status).toBe("cancelled")
  expect(readPlan(other.database, run.id).status).toBe("cancelled")
  expect(other.database.prepare("SELECT id FROM items").all()).toHaveLength(0)
})
it("renews a live generation lease across its original expiry", async () => {
  vi.useFakeTimers()
  const { context, other } = setup()
  let release: (() => void) | undefined
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const request = input()
  const pending = generatePlan(context, request, async (messages) => {
    await barrier
    return model(messages)
  })
  await vi.advanceTimersByTimeAsync(130_000)
  recoverInterruptedPlans(other.database)
  expect(readPlan(other.database, request.requestId).status).toBe("planning")
  release?.()
  expect((await pending).status).toBe("awaiting_confirmation")
  expect(vi.getTimerCount()).toBe(0)
})
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-plan-lock-"))
  const file = join(directory, "db.sqlite")
  const database = openDatabase(file)
  migrateDatabase(database)
  const second = openDatabase(file)
  cleanups.push(() => {
    second.close()
    database.close()
    rmSync(directory, { recursive: true, force: true })
  })
  const context = {
    database,
    secretPath: "",
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
  }
  return { context, other: { ...context, database: second } }
}
const input = (): PlanInput => ({
  requestId: crypto.randomUUID(),
  goal: "完成一份提纲",
  startDate: "2026-09-10",
  dailyMinutes: 25,
  horizonDays: 1,
  contextMode: "goal_only",
})
const model: PlanningModel = async () => ({
  content: JSON.stringify({
    summary: "先写提纲",
    clarification: null,
    tasks: [
      {
        title: "写一份提纲",
        minutes: 20,
        dayOffset: 0,
        reason: "产出可编辑的提纲",
        sourceIds: [],
        existingItemId: null,
      },
    ],
  }),
  model: "fixture",
  durationMs: 0,
  inputTokens: null,
  outputTokens: null,
})
it("reads the authoritative state only after obtaining the write lock", async () => {
  const { context, other } = setup()
  const run = await generatePlan(context, input(), model)
  const exec = context.database.exec.bind(context.database)
  let raced = false
  vi.spyOn(context.database, "exec").mockImplementation((sql) => {
    if (sql === "BEGIN IMMEDIATE" && !raced) {
      raced = true
      cancelPlan(other, run.id)
    }
    return exec(sql)
  })
  expect(() => executePlan(context, run.id)).toThrow("当前不能执行")
  expect(readPlan(context.database, run.id).status).toBe("cancelled")
  expect(context.database.prepare("SELECT id FROM items").all()).toHaveLength(0)
})
it("claims a generation once and does not interrupt another live owner", async () => {
  const { context, other } = setup()
  let release: (() => void) | undefined
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  const waiting: PlanningModel = async (messages) => {
    calls += 1
    await barrier
    return model(messages)
  }
  const request = input()
  const pending = generatePlan(context, request, waiting)
  const replay = await generatePlan(other, request, waiting)
  expect(replay.status).toBe("planning")
  expect(calls).toBe(1)
  recoverInterruptedPlans(other.database)
  expect(readPlan(context.database, request.requestId).status).toBe("planning")
  release?.()
  expect((await pending).status).toBe("awaiting_confirmation")
  expect(executePlan(context, request.requestId).results).toEqual(
    executePlan(other, request.requestId).results,
  )
})
it("expires abandoned generation leases without allowing late completion to overwrite recovery", async () => {
  const { context, other } = setup()
  let release: (() => void) | undefined
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const request = input()
  const pending = generatePlan(context, request, async (messages) => {
    await barrier
    return model(messages)
  })
  other.database.exec("UPDATE plan_runs SET lease_until_ms = 0")
  recoverInterruptedPlans(other.database)
  expect(readPlan(context.database, request.requestId).error?.code).toBe("INTERRUPTED")
  release?.()
  expect((await pending).status).toBe("failed")
  expect(context.database.prepare("SELECT id FROM items").all()).toHaveLength(0)
})
