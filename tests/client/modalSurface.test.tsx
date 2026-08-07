import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { DialogSurface, DrawerSurface } from "../../src/client/components/ui/ModalSurface.js"

afterEach(cleanup)

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <main data-app-background>页面内容</main>
      <button onClick={() => setOpen(true)} type="button">
        打开对话框
      </button>
      {open ? (
        <DialogSurface ariaLabel="测试对话框" onClose={() => setOpen(false)}>
          <button type="button">第一个操作</button>
          <button type="button">最后一个操作</button>
        </DialogSurface>
      ) : null}
    </div>
  )
}

function DrawerHarness() {
  const [open, setOpen] = useState(false)
  const [navigationClicks, setNavigationClicks] = useState(0)
  return (
    <div>
      <main data-app-background>
        <button onClick={() => setNavigationClicks((value) => value + 1)} type="button">
          左侧导航
        </button>
        <output>{navigationClicks}</output>
      </main>
      <button onClick={() => setOpen(true)} type="button">
        打开 AI
      </button>
      {open ? (
        <DrawerSurface ariaLabel="测试 AI 抽屉" onClose={() => setOpen(false)}>
          <button type="button">抽屉操作</button>
        </DrawerSurface>
      ) : null}
    </div>
  )
}

describe("DialogSurface", () => {
  it("traps focus, makes the background inert, and restores the trigger", async () => {
    render(<ModalHarness />)
    const trigger = screen.getByRole("button", { name: "打开对话框" })
    trigger.focus()
    fireEvent.click(trigger)

    const first = screen.getByRole("button", { name: "第一个操作" })
    const last = screen.getByRole("button", { name: "最后一个操作" })
    const background = screen.getByRole("main", { hidden: true })
    await waitFor(() => expect(first).toHaveFocus())
    expect(background).toHaveAttribute("inert")
    expect(document.body.style.overflow).toBe("hidden")

    last.focus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(first).toHaveFocus()

    first.focus()
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(last).toHaveFocus()

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(background).not.toHaveAttribute("inert")
    expect(document.body.style.overflow).toBe("")
    expect(trigger).toHaveFocus()
  })
})

describe("DrawerSurface", () => {
  it("keeps app navigation interactive while the drawer is open", async () => {
    render(<DrawerHarness />)
    fireEvent.click(screen.getByRole("button", { name: "打开 AI" }))

    const background = screen.getByRole("main", { hidden: true })
    const navigation = screen.getByRole("button", { name: "左侧导航", hidden: true })
    expect(background).not.toHaveAttribute("inert")
    expect(document.body.style.overflow).toBe("")

    fireEvent.click(navigation)
    expect(screen.getByText("1")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument())
  })
})
