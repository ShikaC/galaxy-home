import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { afterEach, expect, it } from "vitest"
import { z } from "zod"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createItem } from "../../src/server/repositories/items.js"
import { createManualExport, restoreManualExport } from "../../src/server/services/backup.js"
import { exportSchema } from "../../src/server/services/backupSchema.js"
import {
  claimTaskPlan,
  finishTaskPlan,
  readTaskPlan,
} from "../../src/server/services/taskPlanning/store.js"
import { planRunSchema } from "../../src/shared/planning.js"
import { taskPlanRunSchema } from "../../src/shared/taskPlanning.js"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-task-restore-"))
  const database = openDatabase(join(directory, "test.sqlite"))
  migrateDatabase(database)
  cleanups.push(() => {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  })
  return { database, directory }
}
function taskRun(status: "planning" | "succeeded") {
  const id = crypto.randomUUID()
  const now = "2026-09-10T08:00:00.000Z"
  return taskPlanRunSchema.parse({
    id,
    input: {
      type: "capture",
      requestId: id,
      originalText: "整理客户反馈",
      referenceDate: "2026-09-10",
      timezone: "Asia/Shanghai",
    },
    promptVersion: "task-plan-v1",
    status,
    draftRevision: 0,
    baseSnapshot: null,
    proposal: null,
    attempts: [],
    results: [],
    error: null,
    createdAt: now,
    updatedAt: now,
    executionMs: null,
  })
}
it("cancels restored drafts and rejects late results while preserving successful identities", async () => {
  // Given
  const { database, directory } = setup()
  const pending = taskRun("planning")
  const succeeded = taskRun("succeeded")
  claimTaskPlan(database, pending)
  claimTaskPlan(database, succeeded)
  const bytes = createManualExport(database)
  // When
  await restoreManualExport(database, bytes, join(directory, "backups"))
  const late = finishTaskPlan(database, { ...pending, status: "succeeded" })
  // Then
  expect(late.status).toBe("cancelled")
  expect(late.error?.code).toBe("RESTORED_WORKSPACE")
  expect(readTaskPlan(database, succeeded.id).status).toBe("succeeded")
  expect(
    database
      .prepare("SELECT owner_pid,lease_until_ms FROM task_plan_runs WHERE id=?")
      .get(pending.id),
  ).toEqual({ owner_pid: 0, lease_until_ms: 0 })
})
it("resets legacy planner ownership on restore", async () => {
  // Given
  const { database, directory } = setup()
  const id = crypto.randomUUID()
  const now = "2026-09-10T08:00:00.000Z"
  const run = planRunSchema.parse({
    id,
    input: {
      requestId: id,
      goal: "整理客户反馈",
      startDate: "2026-09-10",
      horizonDays: 1,
      dailyMinutes: 30,
      contextMode: "goal_only",
    },
    status: "planning",
    promptVersion: "workspace-plan-v1",
    retrievalVersion: "lexical-bigram-v1",
    sources: [],
    existingItems: [],
    proposal: null,
    attempts: [],
    results: [],
    error: null,
    createdAt: now,
    updatedAt: now,
    executionMs: null,
  })
  database
    .prepare(
      "INSERT INTO plan_runs(id,state_json,created_at,updated_at,owner_pid,lease_until_ms) VALUES (?,?,?,?,?,?)",
    )
    .run(id, JSON.stringify(run), now, now, process.pid, Date.now() + 120000)
  // When
  await restoreManualExport(database, createManualExport(database), join(directory, "backups"))
  // Then
  expect(
    database.prepare("SELECT owner_pid,lease_until_ms FROM plan_runs WHERE id=?").get(id),
  ).toEqual({ owner_pid: 0, lease_until_ms: 0 })
})
it.each([
  "parent cycle",
  "invalid deadline",
  "grandchild",
  "missing parent",
  "invalid schedule",
  "invalid recurrence",
  "missing new table",
  "invalid create request",
])("rejects %s without changing any existing data", async (reason) => {
  // Given
  const { database, directory } = setup()
  database.exec("UPDATE workspace_settings SET workspace_name='before'")
  const extracted = unzipSync(createManualExport(database))["galaxy-home.json"]
  if (extracted === undefined) throw new Error("Missing archive")
  const source = exportSchema.parse(JSON.parse(strFromU8(extracted)))
  const settings = source.tables["workspace_settings"]?.[0]
  if (settings === undefined) throw new Error("Missing settings")
  settings["workspace_name"] = "after"
  const id = crypto.randomUUID()
  const now = "2026-09-10T08:00:00.000Z"
  const row: Record<string, string | number | null> = {
    id,
    title: "task",
    created_at: now,
    updated_at: now,
  }
  source.tables["items"] = [row]
  switch (reason) {
    case "invalid deadline":
      row["due_at"] = "corrupt"
      break
    case "grandchild": {
      const childId = crypto.randomUUID()
      source.tables["items"] = [
        row,
        { ...row, id: childId, parent_id: id },
        { ...row, id: crypto.randomUUID(), parent_id: childId },
      ]
      break
    }
    case "parent cycle":
      row["parent_id"] = id
      break
    case "missing parent":
      row["parent_id"] = crypto.randomUUID()
      break
    case "invalid schedule":
      row["scheduled_start_at"] = now
      break
    case "invalid recurrence":
      source.tables["task_series"] = [
        {
          id: crypto.randomUUID(),
          title: "invalid",
          timezone: "Asia/Shanghai",
          start_date: "2026-09-10",
          rule_json: '{"frequency":"every-second"}',
          created_at: now,
          updated_at: now,
        },
      ]
      break
    case "invalid create request":
      source.tables["item_create_requests"] = [
        { request_id: crypto.randomUUID(), item_id: id, payload_json: "{", created_at: now },
      ]
      break
    case "missing new table":
      delete source.tables["task_occurrences"]
      break
    default:
      throw new Error("Unexpected test")
  }
  const bytes = zipSync({ "galaxy-home.json": strToU8(JSON.stringify(source)) })
  // When / Then
  await expect(restoreManualExport(database, bytes, join(directory, "backups"))).rejects.toThrow()
  expect(
    z
      .object({ workspace_name: z.string() })
      .parse(database.prepare("SELECT workspace_name FROM workspace_settings").get())
      .workspace_name,
  ).toBe("before")
  expect(database.prepare("SELECT id FROM items").all()).toEqual([])
})

it("preserves create request identities through backup restoration", async () => {
  // Given
  const { database, directory } = setup()
  const input = { requestId: crypto.randomUUID(), title: "客户反馈" }
  const original = createItem(database, input, "2026-09-10", new Date("2026-09-10T08:00:00.000Z"))
  await restoreManualExport(database, createManualExport(database), join(directory, "backups"))
  // When
  const repeated = createItem(database, input, "2026-09-10", new Date("2026-09-10T09:00:00.000Z"))
  // Then
  expect(repeated.id).toBe(original.id)
  expect(database.prepare("SELECT count(*) AS n FROM items").get()).toEqual({ n: 1 })
})
