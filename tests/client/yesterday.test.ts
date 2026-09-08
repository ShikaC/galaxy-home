import { describe, expect, it } from "vitest"
import { leftoverYesterdayItems } from "../../src/client/lib/yesterday.js"
import { itemSchema } from "../../src/shared/items.js"

function item(
  id: string,
  status: "active" | "completed" | "archived",
): ReturnType<typeof itemSchema.parse> {
  return itemSchema.parse({
    id,
    title: id,
    notes: "",
    dueAt: null,
    reminderMinutes: null,
    status,
    completedAt: status === "completed" ? "2026-09-07T00:00:00.000Z" : null,
    categoryIds: [],
    projectIds: [],
    isTutorial: false,
    inToday: true,
    isFocus: false,
    isSecondary: false,
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  })
}

describe("leftoverYesterdayItems", () => {
  it("keeps active leftovers that are not already on today", () => {
    const leftover = item("11111111-1111-4111-8111-111111111111", "active")
    const carried = item("22222222-2222-4222-8222-222222222222", "active")
    expect(leftoverYesterdayItems([leftover, carried], [carried])).toEqual([leftover])
  })

  it("hides yesterday items that were already completed", () => {
    const done = item("33333333-3333-4333-8333-333333333333", "completed")
    expect(leftoverYesterdayItems([done], [])).toEqual([])
  })
})
