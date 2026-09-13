import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppTimeContext } from "../../src/client/components/AppContext.js"
import { TaskSeriesDialog } from "../../src/client/components/TaskSeriesDialog.js"
import { apiRequest } from "../../src/client/lib/api.js"

vi.mock("../../src/client/lib/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/lib/api.js")>()
  return { ...actual, apiRequest: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("TaskSeriesDialog", () => {
  it("creates a workday series with a stable idempotency key when retried", async () => {
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new TypeError("网络中断"))
      .mockResolvedValueOnce({
        id: crypto.randomUUID(),
        version: 1,
        title: "检查客户反馈",
        notes: null,
        priority: "none",
        categoryIds: [],
        projectIds: [],
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], untilDate: null },
        estimatedMinutes: null,
        dueTime: null,
        reminderMinutes: null,
        reminders: [],
        status: "active",
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AppTimeContext.Provider value={{ timezone: "Asia/Shanghai", today: "2026-09-10" }}>
          <TaskSeriesDialog onClose={vi.fn()} open />
        </AppTimeContext.Provider>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText("重复任务标题"), {
      target: { value: "检查客户反馈" },
    })
    fireEvent.click(screen.getByRole("button", { name: "创建系列" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("网络中断"))
    fireEvent.click(screen.getByRole("button", { name: "创建系列" }))
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))

    const first = JSON.parse(String(vi.mocked(apiRequest).mock.calls[0]?.[2]?.body))
    const second = JSON.parse(String(vi.mocked(apiRequest).mock.calls[1]?.[2]?.body))
    expect(second).toEqual(first)
    expect(first).toMatchObject({
      title: "检查客户反馈",
      startDate: "2026-09-10",
      timezone: "Asia/Shanghai",
      rule: { frequency: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] },
    })
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("makes the immutable start date explicit while managing an existing series", async () => {
    const seriesId = crypto.randomUUID()
    vi.mocked(apiRequest).mockResolvedValue([
      {
        id: seriesId,
        version: 3,
        title: "每周复盘",
        notes: null,
        priority: "medium",
        categoryIds: [],
        projectIds: [],
        timezone: "Asia/Shanghai",
        startDate: "2026-09-01",
        rule: { frequency: "weekly", interval: 1, weekdays: [5], untilDate: null },
        estimatedMinutes: 30,
        dueTime: "18:00",
        reminderMinutes: null,
        reminders: [],
        status: "active",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      },
    ])
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AppTimeContext.Provider value={{ timezone: "Asia/Shanghai", today: "2026-09-10" }}>
          <TaskSeriesDialog onClose={vi.fn()} open seriesId={seriesId} />
        </AppTimeContext.Provider>
      </QueryClientProvider>,
    )

    expect(await screen.findByLabelText(/开始日期/)).toBeDisabled()
    expect(screen.getByText("系列创建后不能修改开始日期。")).toBeInTheDocument()
  })
})
