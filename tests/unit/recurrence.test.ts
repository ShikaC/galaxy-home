import { describe, expect, it } from "vitest"
import {
  localOccurrenceInstant,
  occurrenceDates,
  RecurrenceLocalTimeError,
} from "../../src/shared/recurrence.js"

describe("recurrence calendar rules", () => {
  it("applies a daily interval through its inclusive final date", () => {
    // Given
    const rule = { frequency: "daily", interval: 2, untilDate: "2026-09-14" } as const

    // When
    const dates = occurrenceDates(rule, "2026-09-10", "2026-09-09", "2026-09-20")

    // Then
    expect(dates).toEqual(["2026-09-10", "2026-09-12", "2026-09-14"])
  })

  it("keeps weekday occurrence dates stable across a bounded retry", () => {
    // Given
    const rule = { frequency: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] } as const

    // When
    const first = occurrenceDates(rule, "2026-09-10", "2026-09-10", "2026-09-16")
    const retry = occurrenceDates(rule, "2026-09-10", "2026-09-10", "2026-09-16")

    // Then
    expect(first).toEqual(["2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16"])
    expect(retry).toEqual(first)
  })

  it("anchors multi-week rules to the week containing the series start", () => {
    // Given
    const rule = { frequency: "weekly", interval: 2, weekdays: [1, 4] } as const

    // When
    const dates = occurrenceDates(rule, "2026-09-10", "2026-09-01", "2026-09-30")

    // Then
    expect(dates).toEqual(["2026-09-10", "2026-09-21", "2026-09-24"])
  })

  it("skips months that do not contain the requested day", () => {
    // Given
    const rule = { frequency: "monthly", interval: 1, dayOfMonth: 31 } as const

    // When
    const dates = occurrenceDates(rule, "2026-08-31", "2026-09-01", "2026-10-31")

    // Then
    expect(dates).toEqual(["2026-10-31"])
  })

  it("includes the final occurrence date and handles leap years", () => {
    // Given
    const rule = {
      frequency: "monthly",
      interval: 12,
      dayOfMonth: 29,
      untilDate: "2028-02-29",
    } as const

    // When
    const dates = occurrenceDates(rule, "2024-02-29", "2024-01-01", "2029-12-31")

    // Then
    expect(dates).toEqual(["2024-02-29", "2028-02-29"])
  })
})

describe("recurrence local time", () => {
  it("preserves the requested wall time across daylight-saving offset changes", () => {
    // Given
    const timezone = "America/New_York"

    // When
    const winter = localOccurrenceInstant("2026-03-07", "09:00", timezone)
    const summer = localOccurrenceInstant("2026-03-09", "09:00", timezone)

    // Then
    expect(winter.toISOString()).toBe("2026-03-07T14:00:00.000Z")
    expect(summer.toISOString()).toBe("2026-03-09T13:00:00.000Z")
  })

  it("rejects a daylight-saving wall time that does not exist", () => {
    // Given
    const convert = () => localOccurrenceInstant("2026-03-08", "02:30", "America/New_York")

    // When / Then
    expect(convert).toThrow(RecurrenceLocalTimeError)
  })

  it("rejects an ambiguous daylight-saving wall time", () => {
    // Given
    const convert = () => localOccurrenceInstant("2026-11-01", "01:30", "America/New_York")

    // When / Then
    expect(convert).toThrow(RecurrenceLocalTimeError)
  })
})
