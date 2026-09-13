import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiRequest } from "../../src/client/lib/api.js"
import { submitCapture } from "../../src/client/lib/capture.js"
import { itemSchema } from "../../src/shared/items.js"

vi.mock("../../src/client/lib/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/lib/api.js")>()
  return {
    ...actual,
    apiRequest: vi.fn(),
  }
})

const item = itemSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  version: 1,
  title: "今晚看一眼数据目录",
  notes: "",
  priority: "none",
  parentId: null,
  dueAt: null,
  dueDate: null,
  estimatedMinutes: null,
  scheduledStartAt: null,
  scheduledEndAt: null,
  scheduleTimezone: null,
  isFixed: false,
  reminderMinutes: null,
  reminders: [],
  status: "active",
  completedAt: null,
  categoryIds: [],
  projectIds: [],
  recurrenceSeriesId: null,
  recurrenceDate: null,
  recurrenceStatus: null,
  subtaskCount: 0,
  completedSubtaskCount: 0,
  isTutorial: false,
  inToday: false,
  isFocus: false,
  isSecondary: false,
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
})

beforeEach(() => vi.clearAllMocks())

describe("submitCapture", () => {
  it("saves to inbox when placeOnToday is false", async () => {
    vi.mocked(apiRequest).mockResolvedValue(item)
    const result = await submitCapture({
      localDate: "2026-09-07",
      notes: "",
      placeOnToday: false,
      requestId: "33333333-3333-4333-8333-333333333333",
      title: item.title,
    })
    expect(result.destination).toBe("inbox")
    const init = vi.mocked(apiRequest).mock.calls[0]?.[2]
    expect(JSON.parse(String(init?.body))).toEqual({
      requestId: "33333333-3333-4333-8333-333333333333",
      title: item.title,
      categoryIds: [],
      projectIds: [],
    })
  })

  it("places the new item on today after saving", async () => {
    vi.mocked(apiRequest).mockResolvedValue(item)
    const result = await submitCapture({
      localDate: "2026-09-07",
      notes: "",
      placeOnToday: true,
      requestId: "44444444-4444-4444-8444-444444444444",
      title: item.title,
    })
    expect(result.destination).toBe("today")
    const init = vi.mocked(apiRequest).mock.calls[0]?.[2]
    expect(JSON.parse(String(init?.body))).toEqual({
      requestId: "44444444-4444-4444-8444-444444444444",
      title: item.title,
      categoryIds: [],
      projectIds: [],
      today: { localDate: "2026-09-07", isFocus: false, isSecondary: false },
    })
  })

  it("reuses the same request id and payload when an uncertain request is retried", async () => {
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new TypeError("网络连接中断"))
      .mockResolvedValueOnce(item)
    const draft = {
      localDate: "2026-09-07",
      notes: "",
      placeOnToday: true,
      requestId: "55555555-5555-4555-8555-555555555555",
      title: item.title,
    } as const

    await expect(submitCapture(draft)).rejects.toThrow("网络连接中断")
    await expect(submitCapture(draft)).resolves.toMatchObject({ destination: "today" })
    expect(vi.mocked(apiRequest).mock.calls[0]?.[2]).toEqual(
      vi.mocked(apiRequest).mock.calls[1]?.[2],
    )
  })
})
