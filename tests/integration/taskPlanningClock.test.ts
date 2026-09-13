// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, expect, it } from "vitest"
import { z } from "zod"
import type { AppContext } from "../../src/server/context.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  completeTaskPlan,
  prepareTaskPlan,
} from "../../src/server/services/taskPlanning/generate.js"
import { readTaskPlan } from "../../src/server/services/taskPlanning/store.js"
import { calendarSnapshotSchema } from "../../src/shared/calendar.js"

let database: DatabaseSync
let directory: string
let context: AppContext
let now: Date
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-clock-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  database.prepare("UPDATE workspace_settings SET ai_permission = 'open' WHERE id = 1").run()
  now = new Date("2026-09-10T00:00:00.000Z")
  context = {
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: "",
    clock: { now: () => now },
  }
})
afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true })
})
function prepared() {
  return prepareTaskPlan(context, {
    type: "replan",
    requestId: crypto.randomUUID(),
    originalText: "安排今天剩余时间",
    startDate: "2026-09-10",
    endDate: "2026-09-11",
    timezone: "Asia/Shanghai",
    lockedItemIds: [],
  }).run
}

it("passes the actual generation clock while preserving the raw calendar snapshot", async () => {
  // Given
  const run = prepared()
  now = new Date("2026-09-10T02:30:00.000Z")
  const requests: string[] = []
  // When
  const completed = await completeTaskPlan(context, run, async (messages) => {
    for (const message of messages) if (message.role === "user") requests.push(message.content)
    return {
      content: JSON.stringify({ kind: "replan", changes: [], unresolvedConflicts: [] }),
      model: "fixture",
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
    }
  })
  // Then
  expect(requests).toHaveLength(1)
  const request = requests[0]
  if (request === undefined) throw new Error("missing model request")
  const envelope = z
    .object({ currentTime: z.iso.datetime(), calendar: calendarSnapshotSchema })
    .parse(JSON.parse(request))
  expect(envelope.currentTime).toBe(now.toISOString())
  expect(envelope.currentTime).not.toBe(run.createdAt)
  expect(envelope.calendar).toEqual(run.baseSnapshot)
  expect(completed.baseSnapshot).toEqual(run.baseSnapshot)
  expect(completed.promptVersion).toBe("task-plan-v2")
})

it("continues reading persisted v1 runs after new generations use v2", () => {
  // Given
  const run = prepared()
  database
    .prepare(
      "UPDATE task_plan_runs SET state_json = json_set(state_json, '$.promptVersion', 'task-plan-v1') WHERE id = ?",
    )
    .run(run.id)
  // When
  const persisted = readTaskPlan(database, run.id)
  // Then
  expect(persisted.promptVersion).toBe("task-plan-v1")
  expect(persisted.baseSnapshot).toEqual(run.baseSnapshot)
})
