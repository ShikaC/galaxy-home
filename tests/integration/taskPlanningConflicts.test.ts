// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, expect, it } from "vitest"
import type { AppContext } from "../../src/server/context.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createItem } from "../../src/server/repositories/items.js"
import { confirmTaskPlan } from "../../src/server/services/taskPlanning/confirm.js"
import { generateTaskPlan } from "../../src/server/services/taskPlanning/generate.js"

const now = new Date("2026-09-10T00:00:00.000Z")
let database: DatabaseSync
let directory: string
let context: AppContext
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-conflicts-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  database.prepare("UPDATE workspace_settings SET ai_permission = 'open' WHERE id = 1").run()
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

it.each([true, false])("reports final overlap state when resolving move is %s", async (resolve) => {
  // Given
  const before = {
    startAt: "2026-09-10T01:00:00.000Z",
    endAt: "2026-09-10T02:00:00.000Z",
    timezone: "Asia/Shanghai",
  }
  const after = {
    startAt: "2026-09-10T02:00:00.000Z",
    endAt: "2026-09-10T03:00:00.000Z",
    timezone: "Asia/Shanghai",
  }
  const itemInput = {
    title: "原安排",
    priority: "medium" as const,
    isFixed: false,
    categoryIds: [],
    projectIds: [],
    estimatedMinutes: 60,
    scheduledStartAt: before.startAt,
    scheduledEndAt: before.endAt,
    scheduleTimezone: before.timezone,
  }
  const item = createItem(database, itemInput, "2026-09-10", now)
  createItem(database, { ...itemInput, title: "固定会议", isFixed: true }, "2026-09-10", now)
  // When
  const run = await generateTaskPlan(
    context,
    {
      type: "replan",
      requestId: crypto.randomUUID(),
      originalText: "解决今天的冲突",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    },
    async () => ({
      content: JSON.stringify({
        kind: "replan",
        changes: resolve
          ? [
              {
                action: "move",
                itemId: item.id,
                expectedVersion: item.version,
                before,
                after,
                reason: "避开会议",
              },
            ]
          : [],
        unresolvedConflicts: [],
      }),
      model: "fixture",
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
    }),
  )
  // Then
  if (run.proposal?.kind !== "replan") throw new Error("missing replan fixture")
  expect(run.baseSnapshot?.conflicts.some((conflict) => conflict.code === "OVERLAP")).toBe(true)
  expect(
    run.proposal.unresolvedConflicts.some(
      (conflict) => conflict.code === "OVERLAP" && conflict.blocking,
    ),
  ).toBe(!resolve)
  if (resolve) expect(confirmTaskPlan(context, run.id, 0).status).toBe("succeeded")
  else expect(() => confirmTaskPlan(context, run.id, 0)).toThrow()
})
