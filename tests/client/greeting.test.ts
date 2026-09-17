import { describe, expect, it } from "vitest"
import { greetingForHour, greetingLine, hourInTimeZone } from "../../src/client/lib/greeting.js"

describe("hourInTimeZone", () => {
  it("reads the hour in the given zone rather than the host zone", () => {
    const instant = new Date("2026-01-15T23:30:00.000Z")
    expect(hourInTimeZone(instant, "Asia/Shanghai")).toBe(7)
    expect(hourInTimeZone(instant, "America/New_York")).toBe(18)
  })

  it("returns 0 at local midnight instead of 24", () => {
    expect(hourInTimeZone(new Date("2026-01-15T16:00:00.000Z"), "Asia/Shanghai")).toBe(0)
  })
})

describe("greetingForHour", () => {
  it("returns 夜深了 before dawn", () => {
    expect(greetingForHour(2)).toBe("夜深了")
  })

  it("returns 上午好 from 06:00 to 11:59", () => {
    expect(greetingForHour(6)).toBe("上午好")
    expect(greetingForHour(8)).toBe("上午好")
    expect(greetingForHour(11)).toBe("上午好")
  })

  it("returns 下午好 from 12:00 to 17:59", () => {
    expect(greetingForHour(12)).toBe("下午好")
    expect(greetingForHour(15)).toBe("下午好")
    expect(greetingForHour(17)).toBe("下午好")
  })

  it("returns 晚上好 from 18:00 onwards", () => {
    expect(greetingForHour(18)).toBe("晚上好")
    expect(greetingForHour(21)).toBe("晚上好")
    expect(greetingForHour(23)).toBe("晚上好")
  })

  it("rejects hours outside 0-23", () => {
    expect(() => greetingForHour(24)).toThrow(RangeError)
    expect(() => greetingForHour(-1)).toThrow(RangeError)
  })

  it("never returns a second-person greeting without a name", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(greetingLine(greetingForHour(hour), undefined)).toContain("欢迎回到你的空间")
    }
  })
})

describe("greetingLine", () => {
  it("falls back when the workspace has no name yet", () => {
    expect(greetingLine("下午好", undefined)).toBe("下午好，欢迎回到你的空间")
    expect(greetingLine("下午好", "")).toBe("下午好，欢迎回到你的空间")
    expect(greetingLine("下午好", "   ")).toBe("下午好，欢迎回到你的空间")
  })

  it("keeps the fallback for the default 你", () => {
    expect(greetingLine("下午好", "你")).toBe("下午好，欢迎回到你的空间")
  })

  it("adds the chosen name after a comma", () => {
    expect(greetingLine("下午好", "小满")).toBe("下午好，小满")
    expect(greetingLine("下午好", "  小满  ")).toBe("下午好，小满")
  })
})
