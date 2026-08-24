// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

let app: FastifyInstance | undefined
let transcriptionServer: Server | undefined
let database: ReturnType<typeof openDatabase> | undefined
let directory = ""

afterEach(async () => {
  if (app !== undefined) await app.close()
  if (transcriptionServer !== undefined)
    await new Promise<void>((resolve) => transcriptionServer?.close(() => resolve()))
  if (database !== undefined) database.close()
  if (directory !== "") rmSync(directory, { force: true, recursive: true })
  app = undefined
  transcriptionServer = undefined
  database = undefined
  directory = ""
})

describe("voice transcription", () => {
  it("reuses the chat endpoint and model when transcription fields are blank", async () => {
    let requestUrl = ""
    let requestBody = ""
    transcriptionServer = createServer(async (request, response) => {
      requestUrl = request.url ?? ""
      const chunks: Uint8Array[] = []
      for await (const chunk of request) {
        if (typeof chunk === "string") chunks.push(Buffer.from(chunk))
        else chunks.push(chunk)
      }
      requestBody = Buffer.concat(chunks).toString("utf8")
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ text: "把这个想法先记下来" }))
    })
    await new Promise<void>((resolve) => transcriptionServer?.listen(0, "127.0.0.1", resolve))
    const address = transcriptionServer.address()
    if (address === null || typeof address === "string") throw new Error("test server failed")

    directory = mkdtempSync(join(tmpdir(), "galaxy-transcription-"))
    database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const secretPath = join(directory, "secrets.json")
    await writeSecretConfig(secretPath, {
      chatBaseUrl: `http://127.0.0.1:${address.port}/v1`,
      chatModel: "shared-model",
      apiKey: "test-key",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    })
    app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath,
    })
    const boundary = "galaxy-boundary"
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="capture.webm"\r\nContent-Type: audio/webm\r\n\r\nvoice-bytes\r\n--${boundary}--\r\n`,
    )

    const response = await app.inject({
      method: "POST",
      url: "/api/transcribe",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ text: "把这个想法先记下来" })
    expect(requestUrl).toBe("/v1/audio/transcriptions")
    expect(requestBody).toContain('name="model"\r\n\r\nshared-model')
  })
})
