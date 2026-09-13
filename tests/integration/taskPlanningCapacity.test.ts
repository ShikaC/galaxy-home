// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { AppContext } from "../../src/server/context.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createItem } from "../../src/server/repositories/items.js"
import { confirmTaskPlan } from "../../src/server/services/taskPlanning/confirm.js"
import { generateTaskPlan } from "../../src/server/services/taskPlanning/generate.js"
import type { TaskPlanProposal } from "../../src/shared/taskPlanning.js"

const instant = new Date("2026-09-10T00:00:00.000Z")
let database: DatabaseSync
let directory: string
let context: AppContext
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-capacity-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  database.prepare("UPDATE workspace_settings SET ai_permission = 'open' WHERE id = 1").run()
  context = {
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: "",
    clock: { now: () => instant },
  }
})
afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true })
})
function task(overrides: Partial<Parameters<typeof createItem>[1]> = {}) {
  return createItem(
    database,
    {
      title: "待安排工作",
      priority: "medium",
      isFixed: false,
      categoryIds: [],
      projectIds: [],
      estimatedMinutes: 60,
      dueDate: "2026-09-10",
      ...overrides,
    },
    "2026-09-10",
    instant,
  )
}
async function plan(
  options: {
    readonly originalText?: string
    readonly workWindow?: readonly {
      readonly weekday: number
      readonly startTime: string
      readonly endTime: string
    }[]
    readonly changes?: Extract<TaskPlanProposal, { readonly kind: "replan" }>["changes"]
  } = {},
) {
  return generateTaskPlan(
    context,
    {
      type: "replan",
      requestId: crypto.randomUUID(),
      originalText: options.originalText ?? "重排今天",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
      workWindow: options.workWindow ?? [{ weekday: 4, startTime: "09:00", endTime: "10:00" }],
    },
    async () => ({
      content: JSON.stringify({
        kind: "replan",
        changes: options.changes ?? [],
        unresolvedConflicts: [],
      }),
      model: "fixture",
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
    }),
  )
}
function conflicts(run: Awaited<ReturnType<typeof plan>>) {
  if (run.proposal?.kind !== "replan") throw new Error("missing replan fixture")
  return run.proposal.unresolvedConflicts
}

describe("server-derived unresolved replan capacity", () => {
  it("blocks shared capacity overflow when two omitted tasks each fit the only slot", async () => {
    // Given
    const first = task({ title: "第一份方案" })
    const second = task({ title: "第二份方案" })
    // When
    const run = await plan()
    // Then
    expect(
      conflicts(run).some(
        (conflict) => conflict.code === "INSUFFICIENT_CAPACITY" && conflict.blocking,
      ),
    ).toBe(true)
    for (const item of [first, second])
      expect(
        conflicts(run).some((conflict) => conflict.itemId === item.id && conflict.blocking),
      ).toBe(true)
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow()
  })

  it("blocks omitted work when its deadline is before the only free slot", async () => {
    // Given
    const item = task({ dueDate: undefined, dueAt: "2026-09-10T01:00:00.000Z" })
    // When
    const run = await plan()
    // Then
    expect(
      conflicts(run).some(
        (conflict) =>
          conflict.code === "INSUFFICIENT_CAPACITY" &&
          conflict.itemId === item.id &&
          conflict.blocking,
      ),
    ).toBe(true)
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow()
  })

  it("reports fitting scoped work as unresolved when the model leaves it unscheduled", async () => {
    // Given
    const item = task()
    // When
    const run = await plan()
    // Then
    expect(conflicts(run)).toContainEqual(
      expect.objectContaining({ code: "UNSCHEDULED_WORK", itemId: item.id, blocking: true }),
    )
    expect(conflicts(run).some((conflict) => conflict.code === "INSUFFICIENT_CAPACITY")).toBe(false)
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow()
  })

  it("leaves unrelated future backlog out of the requested day", async () => {
    // Given
    task({ dueDate: "2027-01-01", estimatedMinutes: 600 })
    // When
    const run = await plan()
    // Then
    expect(conflicts(run)).toEqual([])
    expect(confirmTaskPlan(context, run.id, 0).status).toBe("succeeded")
  })

  it.each(["named", "all", "keep"] as const)(
    "includes unanchored work when scope is %s",
    async (scope) => {
      // Given
      const item = task({ dueDate: undefined })
      const changes =
        scope === "keep"
          ? [
              {
                action: "keep" as const,
                itemId: item.id,
                before: null,
                after: null,
                reason: "保留",
              },
            ]
          : []
      // When
      const run = await plan({
        originalText:
          scope === "named"
            ? `安排${item.title}`
            : scope === "all"
              ? "安排全部未安排任务"
              : "重排今天",
        changes,
      })
      // Then
      expect(conflicts(run)).toContainEqual(
        expect.objectContaining({ code: "UNSCHEDULED_WORK", itemId: item.id, blocking: true }),
      )
    },
  )

  it("detects deadline-prefix overload even when the whole day has enough capacity", async () => {
    // Given
    for (const title of ["早间一", "早间二"])
      task({ title, estimatedMinutes: 30, dueDate: undefined, dueAt: "2026-09-10T01:30:00.000Z" })
    // When
    const run = await plan({ workWindow: [{ weekday: 4, startTime: "09:00", endTime: "11:00" }] })
    // Then
    expect(conflicts(run)).toContainEqual(
      expect.objectContaining({ code: "INSUFFICIENT_CAPACITY", itemId: null, blocking: true }),
    )
  })

  it("uses capacity left after proposal changes for omitted work", async () => {
    // Given
    const omitted = task()
    const createdId = crypto.randomUUID()
    // When
    const run = await plan({
      changes: [
        {
          action: "create",
          draftId: createdId,
          title: "新增任务",
          estimatedMinutes: 60,
          after: {
            startAt: "2026-09-10T01:00:00.000Z",
            endAt: "2026-09-10T02:00:00.000Z",
            timezone: "Asia/Shanghai",
          },
          reason: "安排新增任务",
        },
      ],
    })
    // Then
    expect(
      conflicts(run).some(
        (conflict) => conflict.code === "INSUFFICIENT_CAPACITY" && conflict.itemId === omitted.id,
      ),
    ).toBe(true)
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow()
    expect(database.prepare("SELECT id FROM items WHERE id = ?").get(createdId)).toBeUndefined()
  })

  it("does not claim impossibility when a greedy allocation fails for feasible work", async () => {
    // Given: 36+12+12 and 30+18+12 each fit a separate hour.
    for (const minutes of [36, 30, 18, 12, 12, 12]) task({ estimatedMinutes: minutes })
    // When
    const run = await plan({
      workWindow: [
        { weekday: 4, startTime: "09:00", endTime: "10:00" },
        { weekday: 4, startTime: "11:00", endTime: "12:00" },
      ],
    })
    // Then
    expect(conflicts(run).some((conflict) => conflict.code === "INSUFFICIENT_CAPACITY")).toBe(false)
    expect(conflicts(run).filter((conflict) => conflict.code === "UNSCHEDULED_WORK")).toHaveLength(
      6,
    )
  })
})
