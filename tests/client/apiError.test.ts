import { describe, expect, it } from "vitest"
import { ApiError, throwApiError } from "../../src/client/lib/api.js"

describe("ApiError transport", () => {
  it("preserves AI error codes from JSON responses", async () => {
    const response = new Response(JSON.stringify({ code: "AI_AUTH", message: "AI 服务鉴权失败" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })
    try {
      await throwApiError(response)
      throw new Error("expected throwApiError to reject")
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ code: "AI_AUTH", message: "AI 服务鉴权失败" })
    }
  })
})
