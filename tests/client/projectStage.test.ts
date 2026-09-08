import { describe, expect, it } from "vitest"
import {
  awaitingNextStage,
  completedStageTaskSummary,
  pinnedProjectCue,
} from "../../src/client/lib/projectStage.js"

describe("awaitingNextStage", () => {
  it("is true only when both current and next tasks are empty", () => {
    expect(awaitingNextStage({ currentTask: null, nextTask: null })).toBe(true)
    expect(awaitingNextStage({ currentTask: { id: "1" }, nextTask: null })).toBe(false)
    expect(awaitingNextStage({ currentTask: null, nextTask: { id: "2" } })).toBe(false)
  })
})

describe("pinnedProjectCue", () => {
  it("points at starting the next stage when no tasks are queued", () => {
    expect(pinnedProjectCue({ currentTask: null, nextTask: null })).toBe("开始下一阶段")
  })

  it("shows the current task title when one exists", () => {
    expect(pinnedProjectCue({ currentTask: { title: "记下收获" }, nextTask: null })).toBe(
      "记下收获",
    )
  })
})

describe("completedStageTaskSummary", () => {
  it("leaves a short list visible", () => {
    expect(completedStageTaskSummary(3)).toBeNull()
  })

  it("collapses a long completed-stage list", () => {
    expect(completedStageTaskSummary(9)).toBe("9 项已完成任务")
  })
})
