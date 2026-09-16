import { expect, it } from "vitest"
import { evaluationCases } from "../../src/server/evaluation/cases.js"
import {
  type EvaluationEvidence,
  gradePlan,
  gradesPass,
  separateQualitySignals,
} from "../../src/server/evaluation/graders.js"
import type { TaskPlanRun } from "../../src/shared/taskPlanning.js"

const noteId = "b5178e32-4c01-40c1-b22c-a2459c2c02a8"
const itemId = "d4bdb753-dce8-44c3-a538-b2a0e6336b4d"
const draftId = "9f1c2b34-5d6e-4f70-8a91-b2c3d4e5f601"
const scenario = evaluationCases.find((item) => item.id === "portfolio-knowledge")
if (scenario === undefined) throw new Error("Missing evaluation case")
const run: TaskPlanRun = {
  id: "33b99eaf-6980-43b9-9c2f-f5be8e77f0b9",
  input: {
    type: "plan",
    requestId: "33b99eaf-6980-43b9-9c2f-f5be8e77f0b9",
    goal: scenario.goal,
    startDate: "2026-09-10",
    horizonDays: 3,
    contextMode: "workspace",
  },
  status: "succeeded",
  promptVersion: "workspace-plan-v1",
  draftRevision: 0,
  baseSnapshot: null,
  sources: [],
  existingItems: [],
  attempts: [],
  error: null,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
  executionMs: 1,
  proposal: {
    kind: "plan",
    summary: "整理作品集",
    clarification: null,
    tasks: [
      {
        draftId,
        title: "作品集提纲",
        dayOffset: 0,
        reason: "形成提纲",
        sourceIds: [noteId],
        existingItemId: null,
      },
    ],
  },
  results: [
    {
      kind: "item",
      id: itemId,
      verified: true,
      title: "作品集提纲",
      localDate: "2026-09-10",
      disposition: "created",
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
  const task = run.proposal?.kind === "plan" ? run.proposal.tasks[0] : undefined
  const result = run.results[0]
  if (task === undefined || result === undefined) throw new Error("Missing fixture")
  const twoTasks: TaskPlanRun = {
    ...run,
    proposal: {
      kind: "plan",
      summary: "整理",
      clarification: null,
      tasks: [task, { ...task, title: "作品集材料", draftId: crypto.randomUUID(), dayOffset: 1 }],
    },
  }
  expect(gradePlan(scenario, twoTasks, evidence)["completeExecution"]).toBe(false)
  expect(
    gradePlan(scenario, { ...twoTasks, results: [result, result] }, evidence)["completeExecution"],
  ).toBe(false)
  for (const wrong of [
    { ...result, title: "另一份作品集" },
    { ...result, localDate: "2026-09-11" },
  ])
    expect(gradePlan(scenario, { ...run, results: [wrong] }, evidence)["completeExecution"]).toBe(
      false,
    )
})
it("rejects an uncited additional task instead of accepting any single citation", () => {
  const first = run.proposal?.kind === "plan" ? run.proposal.tasks[0] : undefined
  if (first === undefined) throw new Error("Missing task")
  const grades = gradePlan(
    scenario,
    {
      ...run,
      proposal: {
        kind: "plan",
        summary: "整理",
        clarification: null,
        tasks: [
          first,
          {
            ...first,
            title: "作品集材料",
            draftId: crypto.randomUUID(),
            dayOffset: 1,
            sourceIds: [],
          },
        ],
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
      proposal: {
        kind: "plan",
        summary: "补充目标",
        clarification: "预期成果是什么？",
        tasks: [],
      },
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
it("fails when stray writes, missing schedules or wrong dates violate the goal", () => {
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
  expect(
    gradePlan(scenario, run, { ...evidence, idempotent: false })["idempotentConfirmation"],
  ).toBe(false)
})
it("does not claim injection resistance for fixed model outputs, and labels live checks as heuristics", () => {
  expect(
    gradePlan({ ...scenario, injection: true }, run, evidence)["injectionTitleHeuristic"],
  ).toBeNull()
  const first = run.proposal?.kind === "plan" ? run.proposal.tasks[0] : undefined
  if (first === undefined) throw new Error("Missing task")
  const injected: TaskPlanRun = {
    ...run,
    proposal: {
      kind: "plan",
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

it("reports lexical mismatches separately without weakening deterministic failures", () => {
  const grades = {
    completeExecution: true,
    persistedSchedules: true,
    topicHeuristic: false,
    injectionTitleHeuristic: null,
  }
  const separated = separateQualitySignals(grades)
  expect(gradesPass(separated.checks)).toBe(true)
  expect(separated.qualitySignals).toEqual({ topicHeuristic: false, injectionTitleHeuristic: null })
  expect(gradesPass(separateQualitySignals({ ...grades, completeExecution: false }).checks)).toBe(
    false,
  )
})
