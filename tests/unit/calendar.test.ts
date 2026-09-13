import { describe, expect, it } from "vitest"
import {
  buildCalendarSnapshotFromItems,
  validateScheduleChanges,
} from "../../src/server/services/calendar.js"
import type { CalendarItem, CalendarSnapshot } from "../../src/shared/calendar.js"
import { itemIdSchema } from "../../src/shared/items.js"

const range = {
  startDate: "2026-09-10",
  endDate: "2026-09-12",
  timezone: "Asia/Shanghai",
  workWindow: [
    { weekday: 4, startTime: "09:00", endTime: "18:00" },
    { weekday: 5, startTime: "09:00", endTime: "18:00" },
  ],
} as const

function item(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: itemIdSchema.parse(crypto.randomUUID()),
    title: "准备方案",
    status: "active",
    version: 1,
    dueAt: null,
    dueDate: null,
    estimatedMinutes: 60,
    scheduledStartAt: null,
    scheduledEndAt: null,
    scheduleTimezone: null,
    isFixed: false,
    dateAssignments: [],
    ...overrides,
  }
}

function snapshot(items: readonly CalendarItem[]): CalendarSnapshot {
  return buildCalendarSnapshotFromItems(items, range)
}

describe("calendar capacity", () => {
  it("returns free intervals around fixed and completed occupancy", () => {
    // Given
    const calendar = snapshot([
      item({
        isFixed: true,
        scheduledStartAt: "2026-09-10T02:00:00.000Z",
        scheduledEndAt: "2026-09-10T03:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      }),
      item({
        status: "completed",
        scheduledStartAt: "2026-09-10T05:00:00.000Z",
        scheduledEndAt: "2026-09-10T06:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      }),
    ])

    // When
    const free = calendar.freeSlots.filter((slot) => slot.localDate === "2026-09-10")

    // Then
    expect(free).toEqual([
      {
        localDate: "2026-09-10",
        startAt: "2026-09-10T01:00:00.000Z",
        endAt: "2026-09-10T02:00:00.000Z",
        minutes: 60,
      },
      {
        localDate: "2026-09-10",
        startAt: "2026-09-10T03:00:00.000Z",
        endAt: "2026-09-10T05:00:00.000Z",
        minutes: 120,
      },
      {
        localDate: "2026-09-10",
        startAt: "2026-09-10T06:00:00.000Z",
        endAt: "2026-09-10T10:00:00.000Z",
        minutes: 240,
      },
    ])
  })

  it("allows back-to-back half-open intervals", () => {
    // Given
    const first = item({
      scheduledStartAt: "2026-09-10T01:00:00.000Z",
      scheduledEndAt: "2026-09-10T02:00:00.000Z",
      scheduleTimezone: "Asia/Shanghai",
    })
    const second = item()

    // When
    const result = validateScheduleChanges(snapshot([first, second]), [
      {
        itemId: second.id,
        expectedVersion: 1,
        scheduledStartAt: "2026-09-10T02:00:00.000Z",
        scheduledEndAt: "2026-09-10T03:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
    ])

    // Then
    expect(result.blockers).toEqual([])
  })

  it("splits cross-midnight occupancy across local days", () => {
    // Given
    const calendar = snapshot([
      item({
        scheduledStartAt: "2026-09-10T09:00:00.000Z",
        scheduledEndAt: "2026-09-11T02:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      }),
    ])

    // When
    const conflictDates = calendar.conflicts
      .filter((conflict) => conflict.code === "OUTSIDE_WORK_WINDOW")
      .map((conflict) => conflict.localDate)

    // Then
    expect(conflictDates).toEqual(["2026-09-10", "2026-09-11"])
  })

  it("reports overlap and insufficient capacity when no slot can fit", () => {
    // Given
    const meeting = item({
      isFixed: true,
      scheduledStartAt: "2026-09-10T01:00:00.000Z",
      scheduledEndAt: "2026-09-10T10:00:00.000Z",
      scheduleTimezone: "Asia/Shanghai",
    })
    const task = item({ estimatedMinutes: 60 })

    // When
    const result = validateScheduleChanges(snapshot([meeting, task]), [
      {
        itemId: task.id,
        expectedVersion: 1,
        scheduledStartAt: "2026-09-10T02:00:00.000Z",
        scheduledEndAt: "2026-09-10T03:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
    ])

    // Then
    expect(result.blockers.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining(["OVERLAP", "INSUFFICIENT_CAPACITY"]),
    )
  })

  it("reports a schedule after its date deadline", () => {
    // Given
    const task = item({ dueDate: "2026-09-10" })

    // When
    const result = validateScheduleChanges(snapshot([task]), [
      {
        itemId: task.id,
        expectedVersion: 1,
        scheduledStartAt: "2026-09-11T01:00:00.000Z",
        scheduledEndAt: "2026-09-11T02:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
    ])

    // Then
    expect(result.blockers.map((conflict) => conflict.code)).toContain("DEADLINE_EXCEEDED")
  })

  it("blocks a candidate that extends beyond the requested range", () => {
    // Given
    const task = item()

    // When
    const result = validateScheduleChanges(snapshot([task]), [
      {
        itemId: task.id,
        expectedVersion: 1,
        scheduledStartAt: "2026-09-11T09:00:00.000Z",
        scheduledEndAt: "2026-09-12T01:30:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
    ])

    // Then
    expect(result.blockers.map((conflict) => conflict.code)).toContain("OUTSIDE_RANGE")
  })

  it("blocks a candidate shorter than its estimate", () => {
    // Given
    const task = item({ estimatedMinutes: 120 })

    // When
    const result = validateScheduleChanges(snapshot([task]), [
      {
        itemId: task.id,
        expectedVersion: 1,
        scheduledStartAt: "2026-09-10T01:00:00.000Z",
        scheduledEndAt: "2026-09-10T02:00:00.000Z",
        scheduleTimezone: "Asia/Shanghai",
      },
    ])

    // Then
    expect(result.blockers.map((conflict) => conflict.code)).toContain("INSUFFICIENT_CAPACITY")
  })

  it("does not include an active scheduled item outside the range", () => {
    // Given
    const outside = item({
      scheduledStartAt: "2026-09-14T01:00:00.000Z",
      scheduledEndAt: "2026-09-14T02:00:00.000Z",
      scheduleTimezone: "Asia/Shanghai",
    })

    // When
    const calendar = snapshot([outside])

    // Then
    expect(calendar.scheduled).toEqual([])
    expect(calendar.conflicts).toEqual([])
  })

  it("rejects malformed ranges at the shared boundary", async () => {
    // Given
    const { calendarQuerySchema } = await import("../../src/shared/calendar.js")

    // When
    const parsed = calendarQuerySchema.safeParse({
      startDate: "2026-09-12",
      endDate: "2026-09-10",
      timezone: "Asia/Shanghai",
    })

    // Then
    expect(parsed.success).toBe(false)
  })
})

describe("calendar scoped capacity", () => {
  it("keeps both work windows around a lunch break", () => {
    // Given
    const query = {
      ...range,
      workWindow: [
        { weekday: 4, startTime: "09:00", endTime: "12:00" },
        { weekday: 4, startTime: "13:00", endTime: "18:00" },
      ],
    }
    // When
    const result = buildCalendarSnapshotFromItems([], query)
    // Then
    expect(result.freeSlots.map((slot) => slot.minutes)).toEqual([180, 300])
  })
  it("does not block a manual task on unrelated unknown durations", () => {
    // Given
    const task = item()
    const base = snapshot([task, item({ estimatedMinutes: null })])
    // When
    const result = validateScheduleChanges(base, [
      {
        itemId: task.id,
        expectedVersion: 1,
        scheduledStartAt: "2026-09-10T01:00:00.000Z",
        scheduledEndAt: "2026-09-10T02:00:00.000Z",
        scheduleTimezone: range.timezone,
      },
    ])
    // Then
    expect(result.valid).toBe(true)
  })
})

it("protects fixed events for AI while permitting explicit manual edits", () => {
  // Given
  const fixed = item({
    isFixed: true,
    estimatedMinutes: null,
    scheduledStartAt: "2026-09-10T02:00:00.000Z",
    scheduledEndAt: "2026-09-10T03:00:00.000Z",
    scheduleTimezone: range.timezone,
  })
  const change = {
    itemId: fixed.id,
    expectedVersion: 1,
    scheduledStartAt: "2026-09-10T03:00:00.000Z",
    scheduledEndAt: "2026-09-10T04:00:00.000Z",
    scheduleTimezone: range.timezone,
  }
  // When
  const manual = validateScheduleChanges(snapshot([fixed]), [change], { manual: true })
  const ai = validateScheduleChanges(snapshot([fixed]), [change])
  // Then
  expect(manual.valid).toBe(true)
  expect(ai.blockers.map((conflict) => conflict.code)).toContain("FIXED_ITEM")
})

it("blocks AI arranging outside work windows", () => {
  // Given
  const task = item()
  // When
  const result = validateScheduleChanges(snapshot([task]), [
    {
      itemId: task.id,
      expectedVersion: 1,
      scheduledStartAt: "2026-09-10T12:00:00.000Z",
      scheduledEndAt: "2026-09-10T13:00:00.000Z",
      scheduleTimezone: range.timezone,
    },
  ])
  // Then
  expect(result.blockers.map((conflict) => conflict.code)).toContain("OUTSIDE_WORK_WINDOW")
})

it("rejects zero-length AI intervals even when called without a route parser", () => {
  // Given
  const task = item()
  // When
  const result = validateScheduleChanges(snapshot([task]), [
    {
      itemId: task.id,
      expectedVersion: 1,
      scheduledStartAt: "2026-09-10T01:00:00.000Z",
      scheduledEndAt: "2026-09-10T01:00:00.000Z",
      scheduleTimezone: range.timezone,
    },
  ])
  // Then
  expect(result.blockers.map((conflict) => conflict.code)).toContain("INVALID_INTERVAL")
})
