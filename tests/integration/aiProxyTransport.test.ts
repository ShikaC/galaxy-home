import { createServer } from "node:http"
import { fetch } from "undici"
import { expect, it, vi } from "vitest"
import { getAiDispatcher } from "../../src/server/services/aiProxy.js"

it("reaches an otherwise unresolvable provider through the configured proxy and bypasses local models", async () => {
  // Given a real HTTP proxy socket serving a provider response.
  const forwards: string[] = []
  const proxy = createServer((request, response) => {
    forwards.push(request.url ?? "")
    response.end("连接成功")
  })
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve))
  const proxyAddress = proxy.address()
  if (proxyAddress === null || typeof proxyAddress === "string") throw new Error("No proxy port")
  vi.stubEnv("http_proxy", `http://127.0.0.1:${proxyAddress.port}`)
  vi.stubEnv("https_proxy", `http://127.0.0.1:${proxyAddress.port}`)
  vi.stubEnv("no_proxy", "")
  const url = "http://provider.invalid/v1/chat/completions"
  const dispatcher = await getAiDispatcher(url)
  try {
    // When Node fetch uses the same dispatcher as the AI service.
    const options = {
      ...(dispatcher === undefined ? {} : { dispatcher }),
      signal: AbortSignal.timeout(3_000),
    }
    const response = await fetch(url, options)
    // Then the proxy, rather than local DNS/direct networking, delivers the response.
    expect(await response.text()).toBe("连接成功")
    expect(forwards).toEqual([url])
    expect(await getAiDispatcher("http://127.0.0.2:11434/v1")).toBeUndefined()
    expect(await getAiDispatcher("http://[::1]:11434/v1")).toBeUndefined()
    expect(await getAiDispatcher("http://localhost:11434/v1")).toBeUndefined()
  } finally {
    vi.unstubAllEnvs()
    await dispatcher?.close()
    await new Promise<void>((resolve) => proxy.close(() => resolve()))
  }
})
