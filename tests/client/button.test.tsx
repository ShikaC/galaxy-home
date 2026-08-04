import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "../../src/client/components/ui/Button.js"

describe("Button", () => {
  it("exposes a busy disabled state when an action is loading", () => {
    // Given
    render(<Button loading>保存更改</Button>)

    // When
    const button = screen.getByRole("button", { name: "保存更改" })

    // Then
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
  })
})
