import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TaskPlanDraftEditor } from "../../src/client/components/taskPlanning/TaskPlanDraftEditor.js"
import { TaskPlanningComposer } from "../../src/client/components/taskPlanning/TaskPlanningComposer.js"

import { captureRun } from "./taskPlanningFixtures.js"

function renderInRouter(element: React.ReactNode) {
  const router = createMemoryRouter([{ path: "/", element }])
  return render(<RouterProvider router={router} />)
}

describe("TaskPlanDraftEditor concurrency", () => {
  it("keeps every local field and the frozen revision when the background run changes", () => {
    const save = vi.fn()
    const { rerender } = renderInRouter(
      <TaskPlanDraftEditor
        run={captureRun}
        pending={false}
        error={null}
        onSave={save}
        onClose={vi.fn()}
        onReload={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText("任务 1 标题"), {
      target: { value: "本地修改后的方案标题" },
    })
    fireEvent.change(screen.getByLabelText("任务 1 说明"), {
      target: { value: "保留这段本地补充" },
    })

    const newer = { ...captureRun, draftRevision: 3, baseSnapshot: null }
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <TaskPlanDraftEditor
            run={newer}
            pending={false}
            error={null}
            onSave={save}
            onClose={vi.fn()}
            onReload={vi.fn()}
          />
        ),
      },
    ])
    rerender(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 2,
        proposal: expect.objectContaining({
          tasks: [
            expect.objectContaining({ title: "本地修改后的方案标题", notes: "保留这段本地补充" }),
          ],
        }),
      }),
    )
    expect(screen.getByDisplayValue("本地修改后的方案标题")).toBeInTheDocument()
    expect(screen.getByDisplayValue("保留这段本地补充")).toBeInTheDocument()
  })
})

describe("TaskPlanningComposer keyboard input", () => {
  it("retains the original text and ignores the submit shortcut during IME composition", () => {
    const submit = vi.fn()
    render(
      <TaskPlanningComposer
        mode="capture"
        today="2026-09-10"
        timezone="Asia/Shanghai"
        pending={false}
        error={new Error("网络不可用")}
        onSubmit={submit}
      />,
    )
    const input = screen.getByRole("textbox", { name: /原始记录/ })
    fireEvent.change(input, { target: { value: "每个工作日检查客户反馈，周五提交方案。" } })
    fireEvent.keyDown(input, { key: "Enter", metaKey: true, isComposing: true, keyCode: 229 })

    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue("每个工作日检查客户反馈，周五提交方案。")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("网络不可用")
  })
})

beforeEach(() => sessionStorage.clear())
afterEach(cleanup)

describe("TaskPlanningComposer safe retries", () => {
  it("submits a real weekday work window for a replan", () => {
    // Given
    const submit = vi.fn()
    render(
      <TaskPlanningComposer
        mode="replan"
        today="2026-09-10"
        timezone="Asia/Shanghai"
        pending={false}
        error={null}
        onSubmit={submit}
      />,
    )
    fireEvent.change(screen.getByRole("textbox", { name: /原始记录/ }), {
      target: { value: "调整未完成任务" },
    })
    // When
    fireEvent.click(screen.getByRole("button", { name: "生成可编辑预览" }))
    // Then
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        workWindow: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startTime: "09:00",
          endTime: "18:00",
        })),
      }),
    )
  })
  it("reuses the request identity after an unknown network result", () => {
    // Given
    const submit = vi.fn()
    render(
      <TaskPlanningComposer
        mode="capture"
        today="2026-09-10"
        timezone="Asia/Shanghai"
        pending={false}
        error={null}
        onSubmit={submit}
      />,
    )
    fireEvent.change(screen.getByRole("textbox", { name: /原始记录/ }), {
      target: { value: "提交方案" },
    })
    // When
    fireEvent.click(screen.getByRole("button", { name: "生成可编辑预览" }))
    fireEvent.click(screen.getByRole("button", { name: "生成可编辑预览" }))
    // Then
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0])
  })
})

describe("TaskPlanDraftEditor reload", () => {
  it("restores unsaved text with its original revision after reopening", () => {
    // Given
    const save = vi.fn()
    const first = renderInRouter(
      <TaskPlanDraftEditor
        run={captureRun}
        pending={false}
        error={null}
        onSave={save}
        onClose={vi.fn()}
        onReload={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText("任务 1 标题"), {
      target: { value: "重启后保留本地方案" },
    })
    first.unmount()
    // When
    renderInRouter(
      <TaskPlanDraftEditor
        run={{ ...captureRun, draftRevision: 3 }}
        pending={false}
        error={null}
        onSave={save}
        onClose={vi.fn()}
        onReload={vi.fn()}
      />,
    )
    // Then
    expect(screen.getByLabelText("任务 1 标题")).toHaveValue("重启后保留本地方案")
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2 }))
  })
})
