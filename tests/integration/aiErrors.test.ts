// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as undici from "undici"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type AiServiceError, chat, transcribe } from "../../src/server/services/ai.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

const directories: string[] = []
const servers: Server[] = []

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>()
  return { ...actual, fetch: vi.fn(actual.fetch) }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  basePath = "/v1",
): Promise<{
  readonly secretPath: string
}> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("test server failed")
  const directory = mkdtempSync(join(tmpdir(), "galaxy-ai-errors-"))
  directories.push(directory)
  const secretPath = join(directory, "secrets.json")
  await writeSecretConfig(secretPath, {
    chatBaseUrl: `http://127.0.0.1:${address.port}${basePath}`,
    chatModel: "test-model",
    apiKey: "test-key",
    transcriptionBaseUrl: "",
    transcriptionModel: "",
  })
  return { secretPath }
}

describe("AI upstream error mapping", () => {
  it("uses the API path when a provider root returns its website", async () => {
    // Given a gateway whose root paths serve its website.
    const { secretPath } = await listen((request, response) => {
      if (request.url !== "/v1/chat/completions") {
        response.writeHead(200, { "Content-Type": "text/html" })
        response.end("<!doctype html><title>Gateway</title>")
        return
      }
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ choices: [{ message: { content: "连接成功" } }] }))
    }, "")
    // When / Then the saved root works without manually appending /v1.
    await expect(chat(secretPath, [{ role: "user", content: "连接测试" }])).resolves.toBe(
      "连接成功",
    )
  })

  it("explains native connect timeouts instead of exposing fetch failed", async () => {
    // Given the error emitted by Node when the direct route cannot connect.
    const { secretPath } = await listen((_request, response) => response.end())
    vi.spyOn(undici, "fetch").mockRejectedValueOnce(
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
      }),
    )
    // When / Then the failure identifies the network/proxy layer.
    await expect(chat(secretPath, [{ role: "user", content: "你好" }])).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      message: "无法连接 AI 服务：网络连接超时，请检查网络或代理是否可用",
    })
  })

  it("maps 401 to AI_AUTH for chat", async () => {
    const { secretPath } = await listen((_request, response) => {
      response.writeHead(401, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "unauthorized" }))
    })
    await expect(chat(secretPath, [{ role: "user", content: "你好" }])).rejects.toMatchObject({
      name: "AiServiceError",
      code: "AI_AUTH",
      message: "AI 服务鉴权失败",
    } satisfies Partial<AiServiceError>)
  })

  it("maps upstream 403 policy blocks to AI_AUTH for chat", async () => {
    const { secretPath } = await listen((_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "blocked by policy" }))
    })
    await expect(chat(secretPath, [{ role: "user", content: "你好" }])).rejects.toMatchObject({
      name: "AiServiceError",
      code: "AI_AUTH",
      message: "AI 服务鉴权失败",
    } satisfies Partial<AiServiceError>)
  })

  it("maps 429 to AI_RATE_LIMIT for transcription", async () => {
    const { secretPath } = await listen((_request, response) => {
      response.writeHead(429, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "rate limited" }))
    })
    await expect(
      transcribe(secretPath, new Uint8Array([1, 2, 3]), "capture.webm", "audio/webm"),
    ).rejects.toMatchObject({
      code: "AI_RATE_LIMIT",
      message: "AI 服务请求过于频繁，请稍后再试",
    })
  })

  it("maps 5xx to AI_UNAVAILABLE for chat", async () => {
    const { secretPath } = await listen((_request, response) => {
      response.writeHead(503, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "down" }))
    })
    await expect(chat(secretPath, [{ role: "user", content: "你好" }])).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      message: "AI 服务返回 503",
    })
  })

  it("maps aborted fetch to AI_UNAVAILABLE", async () => {
    const { secretPath } = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }))
    })
    vi.spyOn(undici, "fetch").mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      }),
    )
    await expect(chat(secretPath, [{ role: "user", content: "你好" }])).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      message: "AI 服务请求超时，请稍后重试",
    })
  })
})
