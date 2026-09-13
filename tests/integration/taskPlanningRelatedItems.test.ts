// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, expect, it } from "vitest"
import type { AppContext } from "../../src/server/context.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createItem, getItem, updateItem } from "../../src/server/repositories/items.js"
import { confirmTaskPlan } from "../../src/server/services/taskPlanning/confirm.js"
import { generateTaskPlan } from "../../src/server/services/taskPlanning/generate.js"

const now = new Date("2026-09-10T00:00:00.000Z")
const today = "2026-09-10"
let database: DatabaseSync
let directory: string
let context: AppContext
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-related-"))
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

async function relatedPlan(childFirst: boolean) {
  const input = {
    title: "父任务",
    priority: "medium" as const,
    isFixed: false,
    categoryIds: [],
    projectIds: [],
    estimatedMinutes: 30,
    dueDate: today,
  }
  const createdParent = createItem(database, input, today, now)
  const child = createItem(
    database,
    { ...input, title: "子任务", parentId: createdParent.id },
    today,
    now,
  )
  const parent = getItem(database, createdParent.id, today)
  const ordered = childFirst ? [child, parent] : [parent, child]
  const changes = ordered.map((item, index) => ({
    action: "move" as const,
    itemId: item.id,
    expectedVersion: item.version,
    before: null,
    after: {
      startAt: `2026-09-10T0${index + 1}:00:00.000Z`,
      endAt: `2026-09-10T0${index + 1}:30:00.000Z`,
      timezone: "Asia/Shanghai",
    },
    reason: "安排父子任务",
  }))
  const run = await generateTaskPlan(
    context,
    {
      type: "replan",
      requestId: crypto.randomUUID(),
      originalText: "安排今天任务",
      startDate: today,
      endDate: "2026-09-11",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    },
    async () => ({
      content: JSON.stringify({ kind: "replan", changes, unresolvedConflicts: [] }),
      model: "fixture",
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
    }),
  )
  return { run, parent, child, changes }
}

it.each([true, false])(
  "confirms related task moves idempotently when child-first is %s",
  async (childFirst) => {
    // Given
    const { run, changes } = await relatedPlan(childFirst)
    // When
    const confirmed = confirmTaskPlan(context, run.id, 0)
    const repeated = confirmTaskPlan(context, run.id, 0)
    // Then
    expect(confirmed.status).toBe("succeeded")
    expect(repeated.results).toEqual(confirmed.results)
    expect(confirmed.results).toHaveLength(2)
    for (const change of changes)
      expect(getItem(database, change.itemId, today)).toMatchObject({
        scheduledStartAt: change.after.startAt,
        scheduledEndAt: change.after.endAt,
        scheduleTimezone: change.after.timezone,
      })
  },
)

it("rejects external child edits before applying either related task move", async () => {
  // Given
  const { run, parent, child } = await relatedPlan(true)
  updateItem(
    database,
    child.id,
    { expectedVersion: child.version, notes: "另一处修改" },
    today,
    now,
  )
  // When / Then
  expect(() => confirmTaskPlan(context, run.id, 0)).toThrow("日历或任务已更新")
  expect(getItem(database, parent.id, today).scheduledStartAt).toBeNull()
  expect(getItem(database, child.id, today).scheduledStartAt).toBeNull()
})
