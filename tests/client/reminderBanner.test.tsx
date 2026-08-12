import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReminderBanner } from "../../src/client/components/ReminderBanner.js"
import { apiRequest, apiVoid } from "../../src/client/lib/api.js"

vi.mock("../../src/client/lib/api.js", () => ({
  apiRequest: vi.fn(),
  apiVoid: vi.fn(),
  jsonBody: (value: unknown) => JSON.stringify(value),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ReminderBanner", () => {
  it("renders the first notification and posts snooze or dismiss", async () => {
    const id = crypto.randomUUID()
    vi.mocked(apiRequest).mockResolvedValue([
      {
        id,
        reminderId: crypto.randomUUID(),
        kind: "morning",
        title: "今天最想推进什么？",
        detail: "从收集箱选择一件，或保留一个足够小的今日重点。",
        scheduledAt: "2026-08-05T01:00:00.000Z",
        entityId: "2026-08-05",
      },
    ])
    vi.mocked(apiVoid).mockResolvedValue(undefined)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, "invalidateQueries")
    render(
      <QueryClientProvider client={client}>
        <ReminderBanner />
      </QueryClientProvider>,
    )

    expect(await screen.findByText("今天最想推进什么？")).toBeInTheDocument()
    expect(screen.getByText("或保留一个足够小的今日重点。", { exact: true })).toHaveClass(
      "reminder-banner__clause",
    )
    fireEvent.click(screen.getByRole("button", { name: /30 分钟后/ }))
    await waitFor(() => {
      expect(apiVoid).toHaveBeenCalledWith(`/api/notifications/${id}/snooze`, {
        method: "POST",
        body: JSON.stringify({ minutes: 30 }),
      })
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] })

    fireEvent.click(screen.getByRole("button", { name: "今天不再提醒" }))
    await waitFor(() => {
      expect(apiVoid).toHaveBeenCalledWith(`/api/notifications/${id}/dismiss`, {
        method: "POST",
      })
    })
  })

  it("leaves unrelated reminder details unsplit", async () => {
    vi.mocked(apiRequest).mockResolvedValue([
      {
        id: crypto.randomUUID(),
        reminderId: crypto.randomUUID(),
        kind: "deadline",
        title: "待办提醒：整理",
        detail: "截止时间 2026/8/12 09:00",
        scheduledAt: "2026-08-12T01:00:00.000Z",
        entityId: crypto.randomUUID(),
      },
    ])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ReminderBanner />
      </QueryClientProvider>,
    )

    expect(await screen.findByText("截止时间 2026/8/12 09:00")).toBeInTheDocument()
    expect(document.querySelector(".reminder-banner__clause")).not.toBeInTheDocument()
  })
})
