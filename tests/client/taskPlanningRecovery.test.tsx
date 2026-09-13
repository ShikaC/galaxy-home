import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TaskPlanDraftEditor } from "../../src/client/components/taskPlanning/TaskPlanDraftEditor.js"
import { TaskPlanningComposer } from "../../src/client/components/taskPlanning/TaskPlanningComposer.js"
import { ApiError } from "../../src/client/lib/api.js"
import { captureRun } from "./taskPlanningFixtures.js"

beforeEach(() => sessionStorage.clear())
afterEach(cleanup)

function editor(error: Error | null, save = vi.fn()) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <TaskPlanDraftEditor
          run={captureRun}
          pending={false}
          error={error}
          onSave={save}
          onClose={vi.fn()}
          onReload={vi.fn()}
        />
      ),
    },
  ])
  return render(<RouterProvider router={router} />)
}

describe("task plan recovery", () => {
  it("preserves a temporarily empty title through a reload without allowing save", () => {
    // Given
    const original = editor(null)
    fireEvent.change(screen.getByLabelText("任务 1 标题"), { target: { value: "" } })
    original.unmount()
    // When
    editor(null)
    // Then
    expect(screen.getByLabelText("任务 1 标题")).toHaveValue("")
    expect(screen.getByRole("button", { name: "保存修改" })).toBeDisabled()
  })
  it("keeps local fields and the original expectedRevision after a server conflict", () => {
    // Given
    const original = editor(null)
    fireEvent.change(screen.getByLabelText("任务 1 说明"), {
      target: { value: "本地尚未保存的中文长说明" },
    })
    original.unmount()
    const save = vi.fn()
    // When
    editor(new ApiError("TASK_PLAN_REVISION_CONFLICT", "任务计划已更新"), save)
    // Then
    expect(screen.getByLabelText("任务 1 说明")).toHaveValue("本地尚未保存的中文长说明")
    expect(screen.getByRole("alert")).toHaveTextContent("任务计划已更新")
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2 }))
  })
  it("restores original input and request identity after an interrupted submit", () => {
    // Given
    const submit = vi.fn()
    const composer = (
      <TaskPlanningComposer
        mode="capture"
        today="2026-09-10"
        timezone="Asia/Shanghai"
        pending={false}
        error={null}
        onSubmit={submit}
      />
    )
    const original = render(composer)
    fireEvent.change(screen.getByRole("textbox", { name: /原始记录/ }), {
      target: { value: "每个工作日检查客户反馈，周五提交方案。" },
    })
    fireEvent.click(screen.getByRole("button", { name: "生成可编辑预览" }))
    original.unmount()
    // When
    render(composer)
    fireEvent.click(screen.getByRole("button", { name: "生成可编辑预览" }))
    // Then
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0])
  })
})
