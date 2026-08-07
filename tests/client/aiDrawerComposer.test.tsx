import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AiDrawerComposer } from "../../src/client/components/AiDrawerComposer.js"

describe("AiDrawerComposer keyboard", () => {
  it("sends on Enter and keeps Shift+Enter for a newline", () => {
    const onSubmit = vi.fn()
    render(
      <AiDrawerComposer
        configured
        content="帮我缩小一下"
        onChange={() => undefined}
        onSubmit={onSubmit}
        pending={false}
      />,
    )
    const input = screen.getByLabelText("给 AI 发送消息")

    const shiftEnter = fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
    expect(shiftEnter).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
