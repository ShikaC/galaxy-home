import { describe, expect, it } from "vitest"
import { createItemInputSchema, updateItemInputSchema } from "../../src/shared/items.js"

describe("task core input schemas", () => {
  it("rejects malformed calendar dates and instants without an offset", () => {
    // Given
    const malformedDate = { title: "日期", categoryIds: [], projectIds: [], dueDate: "2026-02-30" }
    const localInstant = {
      title: "时间",
      categoryIds: [],
      projectIds: [],
      dueAt: "2026-09-10T10:00:00",
    }

    // When
    const dateResult = createItemInputSchema.safeParse(malformedDate)
    const instantResult = createItemInputSchema.safeParse(localInstant)

    // Then
    expect(dateResult.success).toBe(false)
    expect(instantResult.success).toBe(false)
  })

  it("keeps a deadline independent from a valid scheduled interval", () => {
    // Given
    const input = {
      title: "提交方案",
      categoryIds: [],
      projectIds: [],
      dueDate: "2026-09-11",
      scheduledStartAt: "2026-09-10T09:00:00+08:00",
      scheduledEndAt: "2026-09-10T10:00:00+08:00",
      scheduleTimezone: "Asia/Shanghai",
      isFixed: true,
    }

    // When
    const result = createItemInputSchema.safeParse(input)

    // Then
    expect(result.success).toBe(true)
  })

  it("accepts partial PATCH fields for validation after merging with stored state", () => {
    // Given
    const input = { expectedVersion: 4, scheduledEndAt: "2026-09-10T11:00:00+08:00" }

    // When
    const result = updateItemInputSchema.safeParse(input)

    // Then
    expect(result.success).toBe(true)
  })
})
