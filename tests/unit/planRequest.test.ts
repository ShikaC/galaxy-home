import { expect, it } from "vitest"
import { planRequest } from "../../src/client/lib/planRequest.js"
import type { PlanInput } from "../../src/shared/planning.js"

const previous: PlanInput = {
  requestId: crypto.randomUUID(),
  goal: "整理项目提纲，补充回答",
  startDate: "2026-09-10",
  horizonDays: 1,
  dailyMinutes: 45,
  contextMode: "goal_only",
}
it("reuses a retry only for the same source and every unchanged constraint", () => {
  expect(planRequest(previous, { ...previous, requestId: crypto.randomUUID() })).toEqual(previous)
  expect(planRequest(previous, previous, false).requestId).not.toBe(previous.requestId)
  for (const changed of [
    { ...previous, dailyMinutes: 30 },
    { ...previous, horizonDays: 2 },
    { ...previous, startDate: "2026-09-11" },
    { ...previous, contextMode: "workspace" as const },
  ]) {
    const next = planRequest(previous, changed)
    expect(next.requestId).not.toBe(previous.requestId)
    expect({ ...next, requestId: "" }).toEqual({ ...changed, requestId: "" })
  }
})
