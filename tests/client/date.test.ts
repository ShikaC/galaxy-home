import { describe, expect, it } from "vitest"
import { localDateFor, previousCalendarDate } from "../../src/client/lib/date.js"

describe("workspace dates", () => {
  it("uses the selected timezone instead of the browser timezone", () => {
    const instant = new Date("2026-08-04T16:30:00.000Z")
    expect(localDateFor("Asia/Shanghai", instant)).toBe("2026-08-05")
    expect(localDateFor("America/Los_Angeles", instant)).toBe("2026-08-04")
  })

  it("moves across calendar dates without depending on daylight-saving hours", () => {
    expect(previousCalendarDate("2026-03-09")).toBe("2026-03-08")
  })
})
