// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { AppContext } from "../../src/server/context.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createItem } from "../../src/server/repositories/items.js"
import { createTaskSeries } from "../../src/server/services/recurrence.js"
import { confirmTaskPlan } from "../../src/server/services/taskPlanning/confirm.js"
import { cancelTaskPlan, editTaskPlan } from "../../src/server/services/taskPlanning/edit.js"
import {
  completeTaskPlan,
  generateTaskPlan,
  prepareTaskPlan,
  type TaskPlanningModel,
} from "../../src/server/services/taskPlanning/generate.js"
import { recoverTaskPlans } from "../../src/server/services/taskPlanning/store.js"

const instant = new Date("2026-09-10T00:00:00.000Z")
let database: DatabaseSync
let directory: string
let context: AppContext

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-planning-"))
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

function modelFor(value: unknown): TaskPlanningModel {
  return async () => ({
    content: JSON.stringify(value),
    model: "fixture-model",
    durationMs: 3,
    inputTokens: 20,
    outputTokens: 30,
  })
}

const captureInput = () => ({
  type: "capture" as const,
  requestId: crypto.randomUUID(),
  originalText: "每个工作日检查客户反馈，周五提交方案",
  referenceDate: "2026-09-10",
  timezone: "Asia/Shanghai",
})
const captureProposal = () => ({
  kind: "capture" as const,
  tasks: [
    {
      draftId: crypto.randomUUID(),
      title: "提交方案",
      notes: null,
      priority: "high" as const,
      dueDate: "2026-09-11",
      estimatedMinutes: 60,
    },
  ],
  series: [
    {
      draftId: crypto.randomUUID(),
      title: "检查客户反馈",
      notes: null,
      priority: "medium" as const,
      timezone: "Asia/Shanghai",
      startDate: "2026-09-10",
      rule: {
        frequency: "weekly" as const,
        interval: 1,
        weekdays: [1, 2, 3, 4, 5],
        untilDate: null,
      },
      estimatedMinutes: 20,
      dueTime: null,
    },
  ],
  ambiguities: [],
})

describe("durable AI task planning", () => {
  it("creates a weekday series and Friday task only after one idempotent confirmation", async () => {
    // Given
    const input = captureInput()
    const run = await generateTaskPlan(context, input, modelFor(captureProposal()))
    expect(database.prepare("SELECT id FROM items").all()).toHaveLength(0)

    // When
    const first = confirmTaskPlan(context, run.id, 0)
    const repeated = confirmTaskPlan(context, run.id, 0)

    // Then
    expect(first.status).toBe("succeeded")
    expect(repeated.results).toEqual(first.results)
    expect(database.prepare("SELECT id FROM task_series").all()).toHaveLength(1)
    expect(
      database
        .prepare("SELECT id FROM items WHERE title = '提交方案' AND due_date = '2026-09-11'")
        .all(),
    ).toHaveLength(1)
    expect(
      database
        .prepare(
          "SELECT occurrence_date FROM task_occurrences WHERE occurrence_date = '2026-09-11'",
        )
        .all(),
    ).toHaveLength(1)
  })

  it("confirms a valid future series with no occurrence in the materialization window", async () => {
    // Given
    const proposal = captureProposal()
    const future = {
      ...proposal,
      tasks: [],
      series: proposal.series.map((series) => ({ ...series, startDate: "2027-01-01" })),
    }
    const run = await generateTaskPlan(context, captureInput(), modelFor(future))

    // When
    const confirmed = confirmTaskPlan(context, run.id, 0)

    // Then
    expect(confirmed.status).toBe("succeeded")
    expect(database.prepare("SELECT id FROM task_series").all()).toHaveLength(1)
    expect(database.prepare("SELECT item_id FROM task_occurrences").all()).toHaveLength(0)
  })

  it("keeps the base snapshot across edits and rejects an old draft revision", async () => {
    // Given
    const run = await generateTaskPlan(context, captureInput(), modelFor(captureProposal()))
    const proposal = captureProposal()

    // When
    const edited = editTaskPlan(context, run.id, 0, proposal)

    // Then
    expect(edited.draftRevision).toBe(1)
    expect(edited.baseSnapshot).toBe(run.baseSnapshot)
    expect(() => editTaskPlan(context, run.id, 0, proposal)).toThrow("任务计划已更新")
  })

  it("does not allow a late model response to overwrite cancellation", async () => {
    // Given
    let release:
      | ((value: ReturnType<TaskPlanningModel> extends Promise<infer T> ? T : never) => void)
      | undefined
    const deferred = new Promise<Awaited<ReturnType<TaskPlanningModel>>>((resolve) => {
      release = resolve
    })
    const prepared = prepareTaskPlan(context, captureInput())
    const completion = completeTaskPlan(context, prepared.run, () => deferred)

    // When
    cancelTaskPlan(context, prepared.run.id)
    release?.({
      content: JSON.stringify(captureProposal()),
      model: "fixture",
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
    })
    const result = await completion

    // Then
    expect(result.status).toBe("cancelled")
    expect(database.prepare("SELECT id FROM items").all()).toHaveLength(0)
  })

  it("preserves a blocked replan preview for fixed tasks without business writes", async () => {
    // Given
    const fixed = createItem(
      database,
      {
        title: "固定会议",
        priority: "none",
        isFixed: true,
        categoryIds: [],
        projectIds: [],
        estimatedMinutes: 60,
        scheduledStartAt: "2026-09-10T02:00:00.000Z",
        scheduledEndAt: "2026-09-10T03:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
      "2026-09-10",
      instant,
    )
    const input = {
      type: "replan" as const,
      requestId: crypto.randomUUID(),
      originalText: "重新安排",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    }
    const proposal = {
      kind: "replan" as const,
      changes: [
        {
          action: "move" as const,
          itemId: fixed.id,
          expectedVersion: fixed.version,
          before: {
            startAt: fixed.scheduledStartAt,
            endAt: fixed.scheduledEndAt,
            timezone: "Asia/Shanghai",
          },
          after: {
            startAt: "2026-09-10T04:00:00.000Z",
            endAt: "2026-09-10T05:00:00.000Z",
            timezone: "Asia/Shanghai",
          },
          reason: "腾出时段",
        },
      ],
      unresolvedConflicts: [],
    }
    const run = await generateTaskPlan(context, input, modelFor(proposal))

    // When / Then
    expect(
      run.proposal?.kind === "replan"
        ? run.proposal.unresolvedConflicts.some(
            (conflict) => conflict.code === "FIXED_ITEM" && conflict.blocking,
          )
        : false,
    ).toBe(true)
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow()
    expect(
      database.prepare("SELECT scheduled_start_at FROM items WHERE id = ?").get(fixed.id),
    ).toEqual({ scheduled_start_at: fixed.scheduledStartAt })
  })

  it("derives overlap and no-capacity blockers instead of trusting model conflicts", async () => {
    // Given
    createItem(
      database,
      {
        title: "占满时段的会议",
        priority: "none",
        isFixed: true,
        categoryIds: [],
        projectIds: [],
        estimatedMinutes: 60,
        scheduledStartAt: "2026-09-10T01:00:00.000Z",
        scheduledEndAt: "2026-09-10T02:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
      "2026-09-10",
      instant,
    )
    const movable = createItem(
      database,
      {
        title: "待安排任务",
        priority: "medium",
        isFixed: false,
        categoryIds: [],
        projectIds: [],
        estimatedMinutes: 60,
      },
      "2026-09-10",
      instant,
    )
    const input = {
      type: "replan" as const,
      requestId: crypto.randomUUID(),
      originalText: "安排任务",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    }
    const proposal = {
      kind: "replan" as const,
      changes: [
        {
          action: "move" as const,
          itemId: movable.id,
          expectedVersion: movable.version,
          before: null,
          after: {
            startAt: "2026-09-10T01:00:00.000Z",
            endAt: "2026-09-10T02:00:00.000Z",
            timezone: "Asia/Shanghai",
          },
          reason: "模型声称有空间",
        },
      ],
      unresolvedConflicts: [],
    }

    // When
    const run = await generateTaskPlan(context, input, modelFor(proposal))

    // Then
    const codes =
      run.proposal?.kind === "replan"
        ? run.proposal.unresolvedConflicts.map((conflict) => conflict.code)
        : []
    expect(codes).toContain("OVERLAP")
    expect(codes).toContain("INSUFFICIENT_CAPACITY")
  })

  it("rejects confirmation after a meeting is added anywhere in the saved range", async () => {
    // Given
    const movable = createItem(
      database,
      {
        title: "写方案",
        priority: "high",
        isFixed: false,
        categoryIds: [],
        projectIds: [],
        estimatedMinutes: 60,
      },
      "2026-09-10",
      instant,
    )
    const input = {
      type: "replan" as const,
      requestId: crypto.randomUUID(),
      originalText: "安排写方案",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    }
    const proposal = {
      kind: "replan" as const,
      changes: [
        {
          action: "move" as const,
          itemId: movable.id,
          expectedVersion: movable.version,
          before: null,
          after: {
            startAt: "2026-09-10T01:00:00.000Z",
            endAt: "2026-09-10T02:00:00.000Z",
            timezone: "Asia/Shanghai",
          },
          reason: "有空闲",
        },
      ],
      unresolvedConflicts: [],
    }
    const run = await generateTaskPlan(context, input, modelFor(proposal))
    createItem(
      database,
      {
        title: "新增会议",
        priority: "none",
        isFixed: true,
        categoryIds: [],
        projectIds: [],
        estimatedMinutes: 30,
        scheduledStartAt: "2026-09-11T01:00:00.000Z",
        scheduledEndAt: "2026-09-11T01:30:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
      "2026-09-10",
      instant,
    )

    // When / Then
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow("日历或任务已更新")
    expect(
      database.prepare("SELECT scheduled_start_at FROM items WHERE id = ?").get(movable.id),
    ).toEqual({ scheduled_start_at: null })
  })

  it("records model failure without writing task business tables", async () => {
    // Given
    const failingModel: TaskPlanningModel = async () => {
      throw new Error("offline")
    }

    // When
    const run = await generateTaskPlan(context, captureInput(), failingModel)

    // Then
    expect(run.status).toBe("failed")
    expect(run.error?.code).toBe("AI_UNAVAILABLE")
    expect(database.prepare("SELECT id FROM items").all()).toHaveLength(0)
    expect(database.prepare("SELECT id FROM task_plan_runs").all()).toHaveLength(1)
  })

  it("requires open permission before exposing a calendar snapshot and again at confirm", async () => {
    // Given
    const input = {
      type: "replan" as const,
      requestId: crypto.randomUUID(),
      originalText: "重新安排",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    }
    database
      .prepare("UPDATE workspace_settings SET ai_permission = 'conservative' WHERE id = 1")
      .run()

    // When / Then
    expect(() => prepareTaskPlan(context, input)).toThrow("请先在设置中开启开放模式")
    expect(database.prepare("SELECT id FROM task_plan_runs").all()).toHaveLength(0)
    database.prepare("UPDATE workspace_settings SET ai_permission = 'open' WHERE id = 1").run()
    const run = await generateTaskPlan(
      context,
      input,
      modelFor({ kind: "replan", changes: [], unresolvedConflicts: [] }),
    )
    database
      .prepare("UPDATE workspace_settings SET ai_permission = 'conservative' WHERE id = 1")
      .run()
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow("AI 日历权限已关闭")
  })

  it("recovers an abandoned generation lease without losing request identity", () => {
    // Given
    const input = captureInput()
    const prepared = prepareTaskPlan(context, input)
    database
      .prepare("UPDATE task_plan_runs SET owner_pid = 0, lease_until_ms = 0 WHERE id = ?")
      .run(prepared.run.id)

    // When
    recoverTaskPlans(database)
    const replay = prepareTaskPlan(context, input)

    // Then
    expect(replay.claimed).toBe(false)
    expect(replay.run.status).toBe("failed")
    expect(replay.run.error?.code).toBe("INTERRUPTED")
  })

  it("rolls back earlier task writes when a later series write fails", async () => {
    // Given
    const input = captureInput()
    const proposal = captureProposal()
    const seriesDraft = proposal.series[0]
    if (seriesDraft === undefined) throw new Error("missing series fixture")
    createTaskSeries(
      database,
      {
        requestId: seriesDraft.draftId,
        title: "占用请求",
        notes: null,
        priority: "none",
        categoryIds: [],
        projectIds: [],
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 1, untilDate: "2026-09-10" },
        estimatedMinutes: null,
        dueTime: null,
        reminderMinutes: null,
        reminders: [],
      },
      "2026-09-10",
      instant,
    )
    const run = await generateTaskPlan(context, input, modelFor(proposal))

    // When / Then
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow()
    expect(database.prepare("SELECT id FROM items WHERE title = '提交方案'").all()).toHaveLength(0)
    expect(
      database
        .prepare(
          "SELECT json_extract(state_json, '$.status') AS status FROM task_plan_runs WHERE id = ?",
        )
        .get(run.id),
    ).toEqual({ status: "awaiting_confirmation" })
  })

  it("rolls back confirmation when read-back fields differ from the proposal", async () => {
    // Given
    const run = await generateTaskPlan(context, captureInput(), modelFor(captureProposal()))
    database.exec(`CREATE TEMP TRIGGER corrupt_task_plan_insert AFTER INSERT ON items
      WHEN NEW.title = '提交方案' BEGIN UPDATE items SET estimated_minutes = 1 WHERE id = NEW.id; END`)

    // When / Then
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow("任务写入核验失败")
    expect(database.prepare("SELECT id FROM items WHERE title = '提交方案'").all()).toHaveLength(0)
    expect(database.prepare("SELECT id FROM task_series").all()).toHaveLength(0)
  })

  it("surfaces omitted known-duration work when all unscheduled work cannot fit", async () => {
    // Given
    const omitted = createItem(
      database,
      {
        title: "全天研究任务",
        priority: "medium",
        isFixed: false,
        categoryIds: [],
        projectIds: [],
        estimatedMinutes: 600,
      },
      "2026-09-10",
      instant,
    )
    const input = {
      type: "replan" as const,
      requestId: crypto.randomUUID(),
      originalText: "请安排所有未安排任务",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    }

    // When
    const run = await generateTaskPlan(
      context,
      input,
      modelFor({ kind: "replan", changes: [], unresolvedConflicts: [] }),
    )

    // Then
    expect(
      run.proposal?.kind === "replan"
        ? run.proposal.unresolvedConflicts.some(
            (conflict) =>
              conflict.code === "INSUFFICIENT_CAPACITY" && conflict.itemId === omitted.id,
          )
        : false,
    ).toBe(true)
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow("没有可容纳 600 分钟")
  })

  it("rolls back a move when persistence corrupts only its schedule timezone", async () => {
    // Given
    const movable = createItem(
      database,
      {
        title: "时区核验任务",
        priority: "medium",
        isFixed: false,
        categoryIds: [],
        projectIds: [],
        estimatedMinutes: 60,
      },
      "2026-09-10",
      instant,
    )
    const input = {
      type: "replan" as const,
      requestId: crypto.randomUUID(),
      originalText: "安排时区核验任务",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    }
    const run = await generateTaskPlan(
      context,
      input,
      modelFor({
        kind: "replan",
        changes: [
          {
            action: "move",
            itemId: movable.id,
            expectedVersion: movable.version,
            before: null,
            after: {
              startAt: "2026-09-10T01:00:00.000Z",
              endAt: "2026-09-10T02:00:00.000Z",
              timezone: "Asia/Shanghai",
            },
            reason: "安排到工作时段",
          },
        ],
        unresolvedConflicts: [],
      }),
    )
    database.exec(`CREATE TEMP TRIGGER corrupt_move_timezone AFTER UPDATE ON items
      WHEN NEW.id = '${movable.id}' AND NEW.schedule_timezone = 'Asia/Shanghai'
      BEGIN UPDATE items SET schedule_timezone = 'UTC' WHERE id = NEW.id; END`)

    // When / Then
    expect(() => confirmTaskPlan(context, run.id, 0)).toThrow("任务安排写入核验失败")
    expect(
      database
        .prepare("SELECT scheduled_start_at, schedule_timezone FROM items WHERE id = ?")
        .get(movable.id),
    ).toEqual({ scheduled_start_at: null, schedule_timezone: null })
    expect(
      database
        .prepare(
          "SELECT json_extract(state_json, '$.status') AS status FROM task_plan_runs WHERE id = ?",
        )
        .get(run.id),
    ).toEqual({ status: "awaiting_confirmation" })
  })
})
