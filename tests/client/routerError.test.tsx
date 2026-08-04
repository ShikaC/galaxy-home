import { render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RouteErrorPage } from "../../src/client/components/RouteErrorPage.js"

function BrokenPage(): never {
  throw new Error("测试渲染异常")
}

afterEach(() => vi.restoreAllMocks())

describe("root route error boundary", () => {
  it("shows a recoverable application error instead of the router default", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const router = createMemoryRouter([
      { path: "/", element: <BrokenPage />, errorElement: <RouteErrorPage /> },
    ])

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole("heading", { name: "页面暂时无法打开" })).toBeVisible()
    expect(screen.getByRole("button", { name: "重新加载" })).toBeVisible()
    expect(screen.queryByText("Unexpected Application Error!")).not.toBeInTheDocument()
  })
})
