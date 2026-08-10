import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "../../src/client/components/ui/Button.js"
import { IconButton } from "../../src/client/components/ui/IconButton.js"

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

  it("keeps an icon action busy without changing its accessible name", () => {
    // Given
    render(
      <IconButton label="恢复" loading>
        恢复
      </IconButton>,
    )

    // When
    const button = screen.getByRole("button", { name: "恢复" })

    // Then
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
  })
})
