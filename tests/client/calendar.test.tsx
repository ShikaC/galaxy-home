import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { CalendarSchedulePanel } from "../../src/client/components/calendar/CalendarSchedulePanel.js"
import { CalendarTimeline } from "../../src/client/components/calendar/CalendarTimeline.js"
import type { CalendarItem } from "../../src/shared/calendar.js"
import { itemIdSchema } from "../../src/shared/items.js"

afterEach(cleanup)
const item: CalendarItem = {
  id: itemIdSchema.parse(crypto.randomUUID()),
  title: "这是一个很长的中文方案任务，需要与客户反复确认细节后提交最终版本",
  status: "active",
  version: 1,
  dueAt: null,
  dueDate: "2026-09-11",
  estimatedMinutes: 60,
  scheduledStartAt: "2026-09-10T01:00:00.000Z",
  scheduledEndAt: "2026-09-10T02:00:00.000Z",
  scheduleTimezone: "Asia/Shanghai",
  isFixed: false,
  dateAssignments: [],
}

it("preserves edited dates when a stale-version save returns an error", () => {
  // Given
  const props = {
    item,
    mode: "schedule" as const,
    timezone: "Asia/Shanghai",
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
    pending: false,
  }
  const view = render(<CalendarSchedulePanel {...props} error={null} />)
  fireEvent.change(screen.getByLabelText("开始"), { target: { value: "2026-09-10T11:00" } })
  // When
  view.rerender(<CalendarSchedulePanel {...props} error="任务已在其他位置更新" />)
  // Then
  expect(screen.getByLabelText("开始")).toHaveValue("2026-09-10T11:00")
  expect(screen.getByRole("alert")).toHaveTextContent("任务已在其他位置更新")
})

it("opens the actual task through its keyboard-accessible calendar event", () => {
  // Given
  const onEditItem = vi.fn()
  render(
    <CalendarTimeline
      dates={["2026-09-10"]}
      items={[item]}
      timezone="Asia/Shanghai"
      conflicts={[]}
      onDropItem={vi.fn()}
      onEditItem={onEditItem}
    />,
  )
  // When
  fireEvent.click(screen.getByRole("button", { name: `编辑 ${item.title}，09:00 至 10:00` }))
  // Then
  expect(onEditItem).toHaveBeenCalledWith(item)
})

it("does not draw a phantom event on the midnight end date", () => {
  // Given
  const midnight = {
    ...item,
    scheduledStartAt: "2026-09-10T15:00:00.000Z",
    scheduledEndAt: "2026-09-10T16:00:00.000Z",
  }
  // When
  render(
    <CalendarTimeline
      dates={["2026-09-10", "2026-09-11"]}
      items={[midnight]}
      timezone="Asia/Shanghai"
      conflicts={[]}
      onDropItem={vi.fn()}
      onEditItem={vi.fn()}
    />,
  )
  // Then
  expect(screen.getAllByRole("button", { name: /编辑 / })).toHaveLength(1)
})

it("traps keyboard focus in scheduling and returns it to the trigger after Escape", async () => {
  // Given
  function CalendarKeyboardHarness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          安排
        </button>
        {open ? (
          <CalendarSchedulePanel
            item={item}
            mode="schedule"
            timezone="Asia/Shanghai"
            error={null}
            pending={false}
            onCancel={() => setOpen(false)}
            onSubmit={() => undefined}
          />
        ) : null}
      </>
    )
  }
  render(<CalendarKeyboardHarness />)
  const user = userEvent.setup()
  await user.tab()
  // When
  await user.keyboard("{Enter}")
  // Then
  expect(screen.getByRole("dialog", { name: "安排任务" })).toHaveAttribute("aria-modal", "true")
  expect(screen.getByLabelText("开始")).toHaveFocus()
  await user.tab({ shift: true })
  expect(screen.getByRole("button", { name: "保存安排" })).toHaveFocus()
  await user.tab()
  expect(screen.getByLabelText("开始")).toHaveFocus()
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog", { name: "安排任务" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "安排" })).toHaveFocus()
})
