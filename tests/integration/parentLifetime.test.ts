import { afterEach, describe, expect, it, vi } from "vitest"
import { type ParentLifetimeInput, watchParentLifetime } from "../../src/server/parentLifetime.js"

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
})

describe("parent lifetime", () => {
  it("closes the server when the desktop parent closes its stdin", async () => {
    let endListener: (() => void) | undefined
    const input: ParentLifetimeInput = {
      resume: vi.fn(),
      once: (_event, listener) => {
        endListener = listener
      },
    }
    const close = vi.fn(async () => undefined)

    watchParentLifetime(true, input, close)
    endListener?.()
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())

    expect(input.resume).toHaveBeenCalledOnce()
    expect(process.exitCode).toBe(0)
  })

  it("does not attach a parent lifetime watcher for normal server starts", () => {
    const input: ParentLifetimeInput = {
      resume: vi.fn(),
      once: vi.fn(),
    }

    watchParentLifetime(false, input, async () => undefined)

    expect(input.resume).not.toHaveBeenCalled()
    expect(input.once).not.toHaveBeenCalled()
  })
})
