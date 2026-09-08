import { describe, expect, it } from "vitest"
import { formatSkyGreeting, greetingForHour } from "../../src/client/lib/greeting.js"

describe("greetingForHour", () => {
  it("returns 夜深了 before dawn", () => {
    expect(greetingForHour(2)).toBe("夜深了")
  })

  it("returns 早上好 in the morning", () => {
    expect(greetingForHour(8)).toBe("早上好")
  })

  it("returns 中午好 at midday", () => {
    expect(greetingForHour(12)).toBe("中午好")
  })

  it("returns 下午好 in the afternoon", () => {
    expect(greetingForHour(15)).toBe("下午好")
  })

  it("returns 晚上好 after 18:00", () => {
    expect(greetingForHour(21)).toBe("晚上好")
  })

  it("rejects hours outside 0-23", () => {
    expect(() => greetingForHour(24)).toThrow(RangeError)
  })
})

describe("formatSkyGreeting", () => {
  it("keeps the hour phrase when the name is the default 你", () => {
    expect(formatSkyGreeting("下午好", "你")).toBe("下午好")
    expect(formatSkyGreeting("下午好", "  ")).toBe("下午好")
  })

  it("adds the chosen name after a comma", () => {
    expect(formatSkyGreeting("下午好", "小满")).toBe("下午好，小满")
  })
})
