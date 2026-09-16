// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { AppContext } from "../../src/server/context.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { confirmTaskPlan } from "../../src/server/services/taskPlanning/confirm.js"
import { editTaskPlan } from "../../src/server/services/taskPlanning/edit.js"
import {
  completeTaskPlan,
  prepareTaskPlan,
  type TaskPlanningModel,
} from "../../src/server/services/taskPlanning/generate.js"

const instant = new Date("2026-09-10T00:00:00.000Z")
const now = instant.toISOString()
let database: DatabaseSync
let directory: string
let context: AppContext
let noteId: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-plan-mode-"))
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
  noteId = crypto.randomUUID()
  database
    .prepare(
      "INSERT INTO workspace_notes (id, title, content, archived, created_at, updated_at) VALUES (?,?,?,0,?,?)",
    )
    .run(noteId, "作品集案例复盘", "作品集案例的提纲要点与需要补充的验证材料。", now, now)
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

const planInput = () => ({
  type: "plan" as const,
  requestId: crypto.randomUUID(),
  goal: "整理作品集案例提纲与验证材料",
  startDate: "2026-09-10",
  horizonDays: 3,
  dailyMinutes: 60,
  contextMode: "workspace" as const,
})

function proposalFor(tasks: readonly unknown[]) {
  return { summary: "把作品集案例整理成提纲。", clarification: null, tasks }
}

describe("plan 模式（原知识计划）", () => {
  it("检索笔记生成计划，确认后写入任务并排入当天", async () => {
    const prepared = prepareTaskPlan(context, planInput())
    expect(prepared.claimed).toBe(true)
    expect(prepared.run.promptVersion).toBe("workspace-plan-v1")
    // 工作区模式必须真的检索到刚写入的笔记，任务才有依据可引用。
    expect(prepared.run.sources.map((source) => source.id)).toContain(noteId)

    const completed = await completeTaskPlan(
      context,
      prepared.run,
      modelFor(
        proposalFor([
          {
            title: "写作品集案例提纲",
            minutes: 25,
            dayOffset: 0,
            reason: "形成可检查的提纲。",
            sourceIds: [noteId],
            existingItemId: null,
          },
        ]),
      ),
    )
    expect(completed.status).toBe("awaiting_confirmation")
    expect(completed.proposal?.kind).toBe("plan")

    const confirmed = confirmTaskPlan(context, completed.id, completed.draftRevision)
    expect(confirmed.status).toBe("succeeded")
    const result = confirmed.results[0]
    if (result === undefined) throw new Error("确认后应当产生写入结果")
    expect(result.disposition).toBe("created")
    expect(result.localDate).toBe("2026-09-10")
    expect(result.minutes).toBe(25)

    const item = database
      .prepare("SELECT title, estimated_minutes FROM items WHERE id = ?")
      .get(result.id) as { title: string; estimated_minutes: number } | undefined
    expect(item?.title).toBe("写作品集案例提纲")
    // 计划里的分钟数要落到任务上，而不只是写在说明里。
    expect(item?.estimated_minutes).toBe(25)
    const today = database
      .prepare("SELECT is_secondary FROM today_items WHERE item_id = ? AND local_date = ?")
      .get(result.id, "2026-09-10") as { is_secondary: number } | undefined
    expect(today?.is_secondary).toBe(0)
  })

  it("目标含糊时进入待补充，补充后作为新运行重新生成", async () => {
    const prepared = prepareTaskPlan(context, planInput())
    const ambiguous = await completeTaskPlan(
      context,
      prepared.run,
      modelFor({ summary: "需要更多信息。", clarification: "请补充成果形式。", tasks: [] }),
    )
    expect(ambiguous.status).toBe("needs_input")

    // 真实流程里补充说明会开一次新运行（新 requestId，回答并入目标），而不是改写已结束的运行。
    const retry = prepareTaskPlan(context, {
      ...planInput(),
      goal: "整理作品集案例提纲与验证材料\n\n补充说明：需要可检查的提纲。",
    })
    const answered = await completeTaskPlan(
      context,
      retry.run,
      modelFor(
        proposalFor([
          {
            title: "整理验证材料",
            minutes: 20,
            dayOffset: 1,
            reason: "选出两份支撑结果的材料。",
            sourceIds: [],
            existingItemId: null,
          },
        ]),
      ),
    )
    expect(answered.status).toBe("awaiting_confirmation")
    expect(answered.proposal?.kind === "plan" && answered.proposal.tasks[0]?.dayOffset).toBe(1)
  })

  it("编辑提案后修订号递增，且超出每日预算会被拒绝", async () => {
    const prepared = prepareTaskPlan(context, planInput())
    const completed = await completeTaskPlan(
      context,
      prepared.run,
      modelFor(
        proposalFor([
          {
            title: "写提纲",
            minutes: 30,
            dayOffset: 0,
            reason: "形成提纲。",
            sourceIds: [],
            existingItemId: null,
          },
        ]),
      ),
    )
    const proposal = completed.proposal
    if (proposal?.kind !== "plan") throw new Error("expected plan proposal")
    const task = proposal.tasks[0]
    if (task === undefined) throw new Error("计划应当包含一项任务")
    const edited = editTaskPlan(context, completed.id, completed.draftRevision, {
      ...proposal,
      tasks: [{ ...task, minutes: 45 }],
    })
    expect(edited.draftRevision).toBe(completed.draftRevision + 1)

    // dailyMinutes 是 60：两项 40 分钟合计 80，必须被拒绝而不是写入。
    expect(() =>
      editTaskPlan(context, completed.id, edited.draftRevision, {
        ...proposal,
        tasks: [
          { ...task, minutes: 40, draftId: crypto.randomUUID() },
          {
            ...task,
            title: "第二项",
            minutes: 40,
            draftId: crypto.randomUUID(),
          },
        ],
      }),
    ).toThrow(/超过/)
  })

  it("重复确认是幂等的，不重复创建任务", async () => {
    const prepared = prepareTaskPlan(context, planInput())
    const completed = await completeTaskPlan(
      context,
      prepared.run,
      modelFor(
        proposalFor([
          {
            title: "写提纲",
            minutes: 25,
            dayOffset: 0,
            reason: "形成提纲。",
            sourceIds: [],
            existingItemId: null,
          },
        ]),
      ),
    )
    const first = confirmTaskPlan(context, completed.id, completed.draftRevision)
    const second = confirmTaskPlan(context, completed.id, completed.draftRevision)
    expect(second.status).toBe("succeeded")
    expect(second.results).toEqual(first.results)
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM items").get() as { count: number }).count,
    ).toBe(1)
  })
})
