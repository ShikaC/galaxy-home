// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type AiServiceError, chat, transcribe } from "../../src/server/services/ai.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

const directories: string[] = []
const servers: Server[] = []

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
    chatBaseUrl: `http://127.0.0.1:${address.port}/v1`,
    chatModel: "test-model",
    apiKey: "test-key",
    transcriptionBaseUrl: "",
    transcriptionModel: "",
  })
  return { secretPath }
}

describe("AI upstream error mapping", () => {
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
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
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
