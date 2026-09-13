import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TaskPlanTimeField } from "../../src/client/components/taskPlanning/TaskPlanTimeField.js"

afterEach(cleanup)

describe("TaskPlanTimeField", () => {
  it("converts an edited Shanghai wall clock to the exact UTC instant", () => {
    // Given
    const change = vi.fn()
    render(
      <TaskPlanTimeField
        label="新开始"
        value="2026-09-10T06:00:00.000Z"
        timezone="Asia/Shanghai"
        onChange={change}
      />,
    )
    expect(screen.getByLabelText("新开始")).toHaveValue("2026-09-10T14:00")
    // When
    fireEvent.change(screen.getByLabelText("新开始"), { target: { value: "2026-09-10T15:00" } })
    // Then
    expect(change).toHaveBeenCalledWith("2026-09-10T07:00:00.000Z")
  })
  it("preserves an ambiguous clock without silently choosing an occurrence", () => {
    // Given
    function Field() {
      const [value, setValue] = useState("2026-11-01T07:30:00.000Z")
      return (
        <TaskPlanTimeField
          label="新开始"
          value={value}
          timezone="America/New_York"
          onChange={setValue}
        />
      )
    }
    render(<Field />)
    // When
    fireEvent.change(screen.getByLabelText("新开始"), { target: { value: "2026-11-01T01:30" } })
    // Then
    expect(screen.getByLabelText("新开始")).toHaveValue("2026-11-01T01:30")
    expect(screen.getByLabelText("新开始")).toHaveAttribute("aria-invalid", "true")
  })
})
