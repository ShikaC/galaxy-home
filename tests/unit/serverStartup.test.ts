import { describe, expect, it } from "vitest"
import { PORT_IN_USE_EXIT_CODE, serverExitCode } from "../../src/server/startup.js"

describe("server startup", () => {
  it("uses a dedicated exit code when the requested port is already in use", () => {
    const occupied = new Error("listen failed")
    Object.defineProperty(occupied, "code", { value: "EADDRINUSE" })

    expect(serverExitCode(occupied)).toBe(PORT_IN_USE_EXIT_CODE)
    expect(serverExitCode(new Error("database failed"))).toBe(1)
    expect(serverExitCode({ code: "EADDRINUSE" })).toBe(1)
  })
})
