import { describe, expect, it } from "vitest"
import { matchingCommands } from "../../src/client/lib/commandPalette.js"

describe("matchingCommands", () => {
  it("returns every command when the query is empty", () => {
    expect(matchingCommands("").map((command) => command.id)).toEqual([
      "plans",
      "notes",
      "capture",
      "todos",
      "projects",
      "habits",
      "review",
      "settings",
      "ai",
      "theme",
    ])
  })

  it("matches a Chinese label fragment", () => {
    expect(matchingCommands("随手").map((command) => command.id)).toEqual(["capture"])
  })

  it("matches a keyword even when it is not in the label", () => {
    expect(matchingCommands("inbox").map((command) => command.id)).toEqual(["capture"])
  })

  it("can match more than one command", () => {
    expect(matchingCommands("打开").map((command) => command.id)).toContain("todos")
    expect(matchingCommands("打开").map((command) => command.id)).toContain("habits")
  })
})
