// @vitest-environment node
import { DatabaseSync } from "node:sqlite"
import { afterEach, expect, it } from "vitest"
import { migrateDatabase } from "../../src/server/database.js"
import { editPlan } from "../../src/server/services/planning/edit.js"
import { executePlan } from "../../src/server/services/planning/execute.js"
import { generatePlan } from "../../src/server/services/planning/generate.js"
import { readPlan } from "../../src/server/services/planning/store.js"

const database = new DatabaseSync(":memory:")
afterEach(() => database.exec("DELETE FROM today_items; DELETE FROM items; DELETE FROM plan_runs"))
migrateDatabase(database)
const context = { database, secretPath: "", dataDirectory: "", backupDirectory: "" }
async function draft() {
  return generatePlan(
    context,
    {
      requestId: crypto.randomUUID(),
      goal: "整理个人项目说明",
      startDate: "2026-09-10",
      horizonDays: 2,
      dailyMinutes: 45,
      contextMode: "goal_only",
    },
    async () => ({
      content: JSON.stringify({
        summary: "整理可检查的说明",
        clarification: null,
        tasks: [
          {
            title: "撰写说明初稿",
            minutes: 30,
            dayOffset: 0,
            reason: "形成三段说明",
            sourceIds: [],
            existingItemId: null,
          },
        ],
      }),
      model: "fixture",
      durationMs: 1,
      inputTokens: 10,
      outputTokens: 10,
    }),
  )
}
it("edits a draft without provider calls or task writes, then confirms exactly the reviewed revision", async () => {
  const run = await draft()
  const tasks =
    run.proposal?.tasks.map((task) => ({
      ...task,
      title: "核对说明初稿",
      minutes: 20,
      dayOffset: 1,
    })) ?? []
  const edited = editPlan(context, run.id, { expectedRevision: 0, tasks })
  expect(edited.proposalRevision).toBe(1)
  expect(edited.attempts).toEqual(run.attempts)
  expect(database.prepare("SELECT * FROM items").all()).toHaveLength(0)
  expect(() => executePlan(context, run.id, 0)).toThrow("计划已更新")
  expect(readPlan(database, run.id).status).toBe("awaiting_confirmation")
  const done = executePlan(context, run.id, 1)
  expect(done.results[0]).toMatchObject({
    title: "核对说明初稿",
    minutes: 20,
    localDate: "2026-09-11",
  })
  expect(executePlan(context, run.id, 1).results).toEqual(done.results)
})
it("rejects stale editors and invalid changes without altering the saved draft", async () => {
  const run = await draft()
  const tasks = run.proposal?.tasks ?? []
  editPlan(context, run.id, { expectedRevision: 0, tasks })
  expect(() => editPlan(context, run.id, { expectedRevision: 0, tasks })).toThrow("计划已更新")
  const before = readPlan(database, run.id)
  for (const invalid of [
    [],
    tasks.map((t) => ({ ...t, minutes: 46 })),
    tasks.map((t) => ({ ...t, sourceIds: [crypto.randomUUID()] })),
    tasks.map((t) => ({ ...t, dayOffset: 2 })),
  ]) {
    expect(() => editPlan(context, run.id, { expectedRevision: 1, tasks: invalid })).toThrow()
    expect(readPlan(database, run.id)).toEqual(before)
  }
  executePlan(context, run.id, 1)
  expect(() => editPlan(context, run.id, { expectedRevision: 1, tasks })).toThrow("仅待确认")
})
