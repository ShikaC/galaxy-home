import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NextProjectStageForm } from "../../src/client/components/NextProjectStageForm.js"
import { projectSchema } from "../../src/shared/projects.js"

const project = projectSchema.parse({
  id: "71241739-d80c-49a1-a932-4f3b4dda2e65",
  name: "银河居所",
  desiredOutcome: "本地优先的个人空间",
  reason: null,
  notes: null,
  deadlineDate: null,
  status: "active",
  progress: 81,
  progressSource: "manual",
  pinned: true,
  stageTitle: "v1.0",
  currentTask: null,
  nextTask: null,
  completedCount: 0,
  recentProgress: [],
  completedStages: [],
  updatedAt: "2026-09-08T00:00:00.000Z",
})

function renderForm(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <NextProjectStageForm project={project} />
    </QueryClientProvider>,
  )
}

describe("NextProjectStageForm", () => {
  it("enables start after stage name and current task, with outcome notes collapsed", () => {
    renderForm()

    const start = screen.getByRole("button", { name: "开始下一阶段" })
    expect(start).toBeDisabled()
    expect(screen.getByText("记下成果和下一任务（可选）").closest("details")).not.toHaveAttribute(
      "open",
    )

    fireEvent.change(screen.getByLabelText("下一阶段"), { target: { value: "布置" } })
    fireEvent.change(screen.getByLabelText("新的当前任务"), { target: { value: "挑选户外椅" } })
    expect(start).toBeEnabled()
  })
})
