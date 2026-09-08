import { describe, expect, it, vi } from "vitest"
import { ApiError, apiRequest, apiVoid } from "../../src/client/lib/api.js"
import { submitCapture } from "../../src/client/lib/capture.js"
import { itemSchema } from "../../src/shared/items.js"

vi.mock("../../src/client/lib/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/lib/api.js")>()
  return {
    ...actual,
    apiRequest: vi.fn(),
    apiVoid: vi.fn(),
  }
})

const item = itemSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  title: "今晚看一眼数据目录",
  notes: "",
  dueAt: null,
  reminderMinutes: null,
  status: "active",
  completedAt: null,
  categoryIds: [],
  projectIds: [],
  isTutorial: false,
  inToday: false,
  isFocus: false,
  isSecondary: false,
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
})

describe("submitCapture", () => {
  it("saves to inbox when placeOnToday is false", async () => {
    vi.mocked(apiRequest).mockResolvedValue(item)
    const result = await submitCapture({
      localDate: "2026-09-07",
      notes: "",
      placeOnToday: false,
      title: item.title,
    })
    expect(result.destination).toBe("inbox")
    expect(apiVoid).not.toHaveBeenCalled()
  })

  it("places the new item on today after saving", async () => {
    vi.mocked(apiRequest).mockResolvedValue(item)
    vi.mocked(apiVoid).mockResolvedValue(undefined)
    const result = await submitCapture({
      localDate: "2026-09-07",
      notes: "",
      placeOnToday: true,
      title: item.title,
    })
    expect(result.destination).toBe("today")
    expect(apiVoid).toHaveBeenCalledWith(`/api/items/${item.id}/today`, {
      method: "PUT",
      body: JSON.stringify({ localDate: "2026-09-07", isFocus: false, isSecondary: false }),
    })
  })

  it("falls back to a secondary today slot when the primary limit is full", async () => {
    vi.mocked(apiRequest).mockResolvedValue(item)
    vi.mocked(apiVoid)
      .mockRejectedValueOnce(new ApiError("TODAY_LIMIT", "今日主要待办最多只能有 3 个"))
      .mockResolvedValueOnce(undefined)
    const result = await submitCapture({
      localDate: "2026-09-07",
      notes: "",
      placeOnToday: true,
      title: item.title,
    })
    expect(result.destination).toBe("secondary")
    expect(apiVoid).toHaveBeenLastCalledWith(`/api/items/${item.id}/today`, {
      method: "PUT",
      body: JSON.stringify({ localDate: "2026-09-07", isFocus: false, isSecondary: true }),
    })
  })
})
