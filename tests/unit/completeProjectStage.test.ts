import { describe, expect, it } from "vitest"
import { completeProjectStageInputSchema } from "../../src/shared/projects.js"

describe("completeProjectStageInputSchema", () => {
  it("starts the next stage with only a name and current task", () => {
    expect(
      completeProjectStageInputSchema.parse({
        stageTitle: "布置",
        currentTask: "挑选户外椅",
      }),
    ).toEqual({
      outcome: "",
      stageTitle: "布置",
      currentTask: "挑选户外椅",
      nextTask: "",
    })
  })

  it("still requires a stage title and current task", () => {
    expect(() =>
      completeProjectStageInputSchema.parse({
        currentTask: "挑选户外椅",
      }),
    ).toThrow()
    expect(() =>
      completeProjectStageInputSchema.parse({
        stageTitle: "布置",
      }),
    ).toThrow()
  })
})
