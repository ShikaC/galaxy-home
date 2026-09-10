import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, expect, it, vi } from "vitest"
import { PlanRunDetail } from "../../src/client/components/planning/PlanRunDetail.js"
import type { PlanRun } from "../../src/shared/planning.js"

const initial: PlanRun = {
  id: crypto.randomUUID(),
  input: {
    requestId: crypto.randomUUID(),
    goal: "整理项目介绍",
    startDate: "2026-09-10",
    horizonDays: 1,
    dailyMinutes: 45,
    contextMode: "goal_only",
  },
  status: "awaiting_confirmation",
  promptVersion: "workspace-plan-v1",
  retrievalVersion: "lexical-bigram-v1",
  sources: [],
  existingItems: [],
  attempts: [],
  results: [],
  error: null,
  executionMs: null,
  createdAt: "2026-09-10",
  updatedAt: "2026-09-10",
  proposalRevision: 0,
  proposal: {
    summary: "写一份提纲",
    clarification: null,
    tasks: [
      {
        title: "撰写提纲",
        minutes: 20,
        dayOffset: 0,
        reason: "形成可检查的提纲",
        sourceIds: [],
        existingItemId: null,
      },
    ],
  },
}
afterEach(() => vi.unstubAllGlobals())
it("keeps the editor's base revision when a background refetch brings another tab's changes", async () => {
  const sent: unknown[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (typeof init?.body === "string") sent.push(JSON.parse(init.body))
      return new Response(
        JSON.stringify({
          code: "PLAN_REVISION_CONFLICT",
          message: "计划已更新，请重新打开后再调整。",
        }),
        { status: 409 },
      )
    }),
  )
  function Harness() {
    const [run, setRun] = useState(initial)
    return (
      <>
        <button type="button" onClick={() => setRun({ ...initial, proposalRevision: 1 })}>
          模拟后台刷新
        </button>
        <PlanRunDetail
          run={run}
          pending={false}
          onAnswer={() => undefined}
          onCancel={() => undefined}
          onConfirm={() => undefined}
          onRevise={() => undefined}
        />
      </>
    )
  }
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter([{ path: "/", element: <Harness /> }])
  render(
    <QueryClientProvider client={cache}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "调整安排" }))
  fireEvent.change(screen.getByLabelText("任务 1"), { target: { value: "本地尚未保存的标题" } })
  fireEvent.click(screen.getByRole("button", { name: "模拟后台刷新" }))
  fireEvent.click(screen.getByRole("button", { name: "保存调整" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("计划已更新"))
  expect(sent).toEqual([
    expect.objectContaining({
      expectedRevision: 0,
      tasks: [expect.objectContaining({ title: "本地尚未保存的标题" })],
    }),
  ])
  expect(screen.getByDisplayValue("本地尚未保存的标题")).toBeInTheDocument()
})
