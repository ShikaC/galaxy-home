import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppTimeContext } from "../../src/client/components/AppContext.js"
import { CaptureDialog } from "../../src/client/components/CaptureDialog.js"
import { submitCapture } from "../../src/client/lib/capture.js"
import { useMeta } from "../../src/client/lib/queries.js"

vi.mock("../../src/client/lib/capture.js", () => ({ submitCapture: vi.fn() }))
vi.mock("../../src/client/lib/queries.js", () => ({ useMeta: vi.fn() }))

afterEach(() => vi.clearAllMocks())

describe("CaptureDialog keyboard input", () => {
  it("does not submit when Enter confirms an IME composition", () => {
    vi.mocked(useMeta).mockReturnValue({
      data: { ai: { configured: false } },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMeta>)
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppTimeContext.Provider value={{ timezone: "Asia/Shanghai", today: "2026-09-10" }}>
          <CaptureDialog onClose={vi.fn()} open />
        </AppTimeContext.Provider>
      </QueryClientProvider>,
    )
    const title = screen.getByLabelText("标题")
    fireEvent.change(title, { target: { value: "检查客户反馈" } })

    const allowedDefault = fireEvent.keyDown(title, {
      key: "Enter",
      metaKey: true,
      isComposing: true,
      keyCode: 229,
    })

    expect(allowedDefault).toBe(false)
    expect(submitCapture).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue("检查客户反馈")).toBeInTheDocument()
  })
})
