import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppTimeContext } from "../../src/client/components/AppContext.js"
import { TaskRow } from "../../src/client/components/TaskRow.js"
import { itemSchema } from "../../src/shared/items.js"

const item = itemSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  title: "准备周末出行",
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

  it("keeps deadline, schedule, estimate, recurrence and subtask progress distinct", () => {
    render(
      <AppTimeContext.Provider value={{ timezone: "Asia/Shanghai", today: "2026-08-05" }}>
        <TaskRow
          item={{
            ...item,
            priority: "high",
            dueDate: "2026-08-08",
            estimatedMinutes: 45,
            scheduledStartAt: "2026-08-06T01:00:00.000Z",
            scheduledEndAt: "2026-08-06T01:45:00.000Z",
            scheduleTimezone: "Asia/Shanghai",
            isFixed: true,
            reminders: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                anchor: "scheduled",
                offsetMinutes: 10,
                version: 1,
                enabled: true,
              },
            ],
            recurrenceSeriesId: "44444444-4444-4444-8444-444444444444",
            recurrenceDate: "2026-08-06",
            recurrenceStatus: "active",
            subtaskCount: 3,
            completedSubtaskCount: 1,
          }}
          onComplete={vi.fn()}
        />
      </AppTimeContext.Provider>,
    )

    expect(screen.getByText("高优先")).toBeInTheDocument()
    expect(screen.getByText("截止 08-08")).toBeInTheDocument()
    expect(screen.getByTitle("固定日程")).toHaveTextContent("固定")
    expect(screen.getByText("预计 45 分钟")).toBeInTheDocument()
    expect(screen.getByText("1 个提醒")).toBeInTheDocument()
    expect(screen.getByText("重复 · 2026-08-06")).toBeInTheDocument()
    expect(screen.getByText("子任务 1/3")).toBeInTheDocument()
  })
})
