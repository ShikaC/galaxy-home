import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import {
  strictInstantForLocalInput,
  useTaskEditorDraft,
} from "../../src/client/components/useTaskEditorDraft.js"
import { itemSchema } from "../../src/shared/items.js"

const original = itemSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  title: "整理客户反馈",
  notes: "第一版",
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
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
})

function DraftHarness() {
  const [item, setItem] = useState(original)
  const editor = useTaskEditorDraft(item, "Asia/Shanghai")
  return (
    <>
      <button
        onClick={() =>
          setItem({ ...item, title: "另一窗口的新标题", updatedAt: "2026-09-10T01:00:00.000Z" })
        }
        type="button"
      >
        模拟后台刷新
      </button>
      <label>
        标题
        <input
          onChange={(event) => editor.update({ title: event.target.value })}
          value={editor.draft.title}
        />
      </label>
      <output>{editor.expectedVersion}</output>
    </>
  )
}

describe("task editor draft", () => {
  it("keeps dirty input and the opening version when a background refetch replaces the item", () => {
    render(<DraftHarness />)

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "本地尚未保存的长标题" } })
    fireEvent.click(screen.getByRole("button", { name: "模拟后台刷新" }))

    expect(screen.getByDisplayValue("本地尚未保存的长标题")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("rejects nonexistent and ambiguous DST wall times instead of silently moving them", () => {
    expect(() => strictInstantForLocalInput("2026-03-08T02:30", "America/New_York")).toThrow(
      "不存在",
    )
    expect(() => strictInstantForLocalInput("2026-11-01T01:30", "America/New_York")).toThrow(
      "出现两次",
    )
    expect(strictInstantForLocalInput("2026-03-08T03:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    )
  })
})
