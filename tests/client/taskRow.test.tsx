import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppTimeContext } from "../../src/client/components/AppContext.js"
import { TaskRow } from "../../src/client/components/TaskRow.js"
import { itemSchema } from "../../src/shared/items.js"

const item = itemSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  title: "准备周末出行",
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
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
})

describe("TaskRow", () => {
  it("exposes an edit action for an existing task", () => {
    const onEdit = vi.fn()
    render(
      <AppTimeContext.Provider value={{ timezone: "Asia/Shanghai", today: "2026-08-05" }}>
        <TaskRow item={item} onComplete={vi.fn()} onEdit={onEdit} />
      </AppTimeContext.Provider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑待办" }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
