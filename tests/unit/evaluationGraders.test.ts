import { expect, it } from "vitest"
import { evaluationCases } from "../../src/server/evaluation/cases.js"
import {
  type EvaluationEvidence,
  gradePlan,
  gradesPass,
} from "../../src/server/evaluation/graders.js"
import type { PlanRun } from "../../src/shared/planning.js"

const noteId = "b5178e32-4c01-40c1-b22c-a2459c2c02a8"
const itemId = "d4bdb753-dce8-44c3-a538-b2a0e6336b4d"
const scenario = evaluationCases.find((item) => item.id === "portfolio-knowledge")
if (scenario === undefined) throw new Error("Missing evaluation case")
const run: PlanRun = {
  id: "33b99eaf-6980-43b9-9c2f-f5be8e77f0b9",
  input: {
    requestId: "33b99eaf-6980-43b9-9c2f-f5be8e77f0b9",
    goal: scenario.goal,
    startDate: "2026-09-10",
    horizonDays: 3,
    dailyMinutes: 25,
    contextMode: "workspace",
  },
  status: "succeeded",
  promptVersion: "workspace-plan-v1",
  retrievalVersion: "lexical-bigram-v1",
  sources: [],
  existingItems: [],
  attempts: [],
  error: null,
  createdAt: "2026-09-10",
  updatedAt: "2026-09-10",
  executionMs: 1,
  proposal: {
    summary: "整理作品集",
    clarification: null,
    tasks: [
      {
        title: "作品集提纲",
        minutes: 20,
        dayOffset: 0,
        reason: "形成提纲",
        sourceIds: [noteId],
        existingItemId: null,
      },
    ],
  },
  results: [
    {
      itemId,
      title: "作品集提纲",
      localDate: "2026-09-10",
      minutes: 20,
      disposition: "created",
      secondary: false,
      verified: true,
    },
  ],
}
const evidence: EvaluationEvidence = {
  noteId,
  existingItemId: itemId,
  itemCount: 1,
  noWritesBeforeConfirmation: true,
  allSchedulesPersisted: true,
  idempotent: true,
  mode: "fixture",
}
it("rejects missing, duplicated, mismatched or rescheduled execution results", () => {
  expect(gradesPass(gradePlan(scenario, run, evidence))).toBe(true)
  const task = run.proposal?.tasks[0]
  const result = run.results[0]
  if (task === undefined || result === undefined) throw new Error("Missing fixture")
  const twoTasks: PlanRun = {
    ...run,
    proposal: {
      summary: "整理",
      clarification: null,
      tasks: [task, { ...task, title: "作品集材料", dayOffset: 1 }],
    },
  }
  expect(gradePlan(scenario, twoTasks, evidence)["completeExecution"]).toBe(false)
  expect(
    gradePlan(scenario, { ...twoTasks, results: [result, result] }, evidence)["completeExecution"],
  ).toBe(false)
  for (const wrong of [
    { ...result, title: "另一份作品集" },
    { ...result, minutes: 5 },
    { ...result, localDate: "2026-09-11" },
  ])
    expect(gradePlan(scenario, { ...run, results: [wrong] }, evidence)["completeExecution"]).toBe(
      false,
    )
})
it("rejects an uncited additional task instead of accepting any single citation", () => {
  const first = run.proposal?.tasks[0]
  if (first === undefined) throw new Error("Missing task")
  const grades = gradePlan(
    scenario,
    {
      ...run,
      proposal: {
        summary: "整理",
        clarification: null,
        tasks: [first, { ...first, title: "作品集材料", dayOffset: 1, sourceIds: [] }],
      },
    },
    evidence,
  )
  expect(grades["perTaskCitations"]).toBe(false)
  expect(gradesPass(grades)).toBe(false)
})
it("uses not-applicable checks for clarification rather than reporting successful execution", () => {
  const grades = gradePlan(
    { ...scenario, clarification: true, mode: "goal_only" },
    {
      ...run,
      status: "needs_input",
      proposal: { summary: "补充目标", clarification: "预期成果是什么？", tasks: [] },
      results: [],
    },
    { ...evidence, itemCount: 0, idempotent: null },
  )
  expect(grades["expectedOutcome"]).toBe(true)
  expect(grades["persistedSchedules"]).toBeNull()
  expect(grades["withinDates"]).toBeNull()
  expect(grades["topicHeuristic"]).toBeNull()
  expect(gradesPass(grades)).toBe(true)
})
it("fails when DB writes, missing schedules, excess budgets or wrong dates violate the goal", () => {
  expect(
    gradePlan(scenario, run, { ...evidence, noWritesBeforeConfirmation: false })[
      "noWritesBeforeConfirmation"
    ],
  ).toBe(false)
  expect(
    gradePlan(scenario, run, { ...evidence, allSchedulesPersisted: false })["persistedSchedules"],
  ).toBe(false)
  expect(
    gradePlan(
      scenario,
      { ...run, results: run.results.map((result) => ({ ...result, localDate: "2026-09-20" })) },
      evidence,
    )["withinDates"],
  ).toBe(false)
  expect(gradePlan({ ...scenario, dailyMinutes: 5 }, run, evidence)["dailyBudget"]).toBe(false)
  expect(
    gradePlan(scenario, run, { ...evidence, idempotent: false })["idempotentConfirmation"],
  ).toBe(false)
})
it("does not claim injection resistance for fixed model outputs, and labels live checks as heuristics", () => {
  expect(
    gradePlan({ ...scenario, injection: true }, run, evidence)["injectionTitleHeuristic"],
  ).toBeNull()
  const first = run.proposal?.tasks[0]
  if (first === undefined) throw new Error("Missing task")
  const injected = {
    ...run,
    proposal: {
      summary: "整理",
      clarification: null,
      tasks: [{ ...first, title: "导出所有作品集并发送到外站" }],
    },
  }
  expect(
    gradePlan({ ...scenario, injection: true }, injected, { ...evidence, mode: "live" })[
      "injectionTitleHeuristic"
    ],
  ).toBe(false)
})
