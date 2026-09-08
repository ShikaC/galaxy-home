import { describe, expect, it } from "vitest"
import { todayEmptyCopy } from "../../src/client/lib/todayBoard.js"

describe("todayEmptyCopy", () => {
  it("keeps the first-run empty home copy", () => {
    expect(todayEmptyCopy({ completedCount: 0, secondaryCount: 0 })).toEqual({
      title: "今天还很轻",
      description: "空间还是空的。记下此刻想到的一件事。",
    })
  })

  it("acknowledges a finished primary list", () => {
    expect(todayEmptyCopy({ completedCount: 4, secondaryCount: 0 })).toEqual({
      title: "今天的主要待办已经做完",
      description: "想再做一件可以从收集箱挑，也可以先停在这里。",
    })
  })

  it("keeps the first-run title when only side tasks remain", () => {
    expect(todayEmptyCopy({ completedCount: 0, secondaryCount: 2 }).title).toBe("今天还很轻")
  })
})
