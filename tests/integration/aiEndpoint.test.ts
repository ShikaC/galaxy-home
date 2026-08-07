import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  assertSafeAiEndpoint,
  isBlockedAddress,
  isLoopbackAddress,
} from "../../src/server/services/aiEndpoint.js"

const directories: string[] = []
afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { force: true, recursive: true })
  })
})

describe("AI endpoint policy", () => {
  it("classifies loopback and blocked addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true)
    expect(isLoopbackAddress("::1")).toBe(true)
    expect(isBlockedAddress("169.254.169.254")).toBe(true)
    expect(isBlockedAddress("192.168.1.1")).toBe(true)
    expect(isBlockedAddress("10.0.0.1")).toBe(true)
    expect(isBlockedAddress("8.8.8.8")).toBe(false)
  })

  it("allows loopback HTTP and public HTTPS with safe DNS", async () => {
    await expect(assertSafeAiEndpoint("http://127.0.0.1:11434/v1")).resolves.toBeUndefined()
    await expect(assertSafeAiEndpoint("http://localhost:11434/v1")).resolves.toBeUndefined()
    await expect(
      assertSafeAiEndpoint("https://api.openai.com/v1", async () => [
        { address: "104.18.0.1", family: 4 },
      ]),
    ).resolves.toBeUndefined()
  })

  it("rejects metadata, private LAN, credentials, and unsafe DNS", async () => {
    await expect(assertSafeAiEndpoint("http://169.254.169.254/latest")).rejects.toMatchObject({
      code: "AI_INVALID_ENDPOINT",
    })
    await expect(assertSafeAiEndpoint("http://192.168.1.1/v1")).rejects.toMatchObject({
      code: "AI_INVALID_ENDPOINT",
    })
    await expect(assertSafeAiEndpoint("https://user:pass@api.openai.com/v1")).rejects.toMatchObject(
      {
        code: "AI_INVALID_ENDPOINT",
      },
    )
    await expect(
      assertSafeAiEndpoint("https://evil.example/v1", async () => [
        { address: "169.254.169.254", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "AI_INVALID_ENDPOINT" })
    await expect(
      assertSafeAiEndpoint("https://evil.example/v1", async () => [
        { address: "10.0.0.8", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "AI_INVALID_ENDPOINT" })
  })

  it("rejects unsafe URLs when saving AI config", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-ai-endpoint-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })

    const response = await app.inject({
      method: "PUT",
      url: "/api/ai/config",
      payload: {
        chatBaseUrl: "http://169.254.169.254/v1",
        chatModel: "test",
        apiKey: "secret-key",
        transcriptionBaseUrl: "",
        transcriptionModel: "",
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<{ code: string }>()).toMatchObject({ code: "AI_INVALID_ENDPOINT" })
    expect((await app.inject({ method: "GET", url: "/api/ai/config" })).json()).toMatchObject({
      configured: false,
      hasApiKey: false,
    })
    await app.close()
    database.close()
  })

  it("accepts loopback config writes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-ai-endpoint-ok-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })

    const response = await app.inject({
      method: "PUT",
      url: "/api/ai/config",
      payload: {
        chatBaseUrl: "http://127.0.0.1:11434/v1",
        chatModel: "llama",
        apiKey: "local-key",
        transcriptionBaseUrl: "",
        transcriptionModel: "",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      configured: true,
      chatBaseUrl: "http://127.0.0.1:11434/v1",
      hasApiKey: true,
    })
    await app.close()
    database.close()
  })
})
