import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { getAiConfigStatus, writeSecretConfig } from "../../src/server/services/secrets.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe("AI secret storage", () => {
  it("preserves an existing API key when other settings change", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-secrets-"))
    directories.push(directory)
    const path = join(directory, "secrets.json")
    await writeSecretConfig(path, {
      chatBaseUrl: "http://127.0.0.1:11434/v1",
      chatModel: "model",
      apiKey: "secret",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    })
    await writeSecretConfig(path, {
      chatBaseUrl: "http://127.0.0.1:11434/v2",
      chatModel: "model-2",
      apiKey: "",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    })

    expect(readFileSync(path, "utf8")).toContain("secret")
  })

  it.skipIf(process.platform === "win32")(
    "repairs POSIX permissions on an existing secret file",
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "galaxy-secrets-permissions-"))
      directories.push(directory)
      const path = join(directory, "secrets.json")
      await writeSecretConfig(path, {
        chatBaseUrl: "http://127.0.0.1:11434/v1",
        chatModel: "model",
        apiKey: "secret",
        transcriptionBaseUrl: "",
        transcriptionModel: "",
      })
      chmodSync(path, 0o644)
      await writeSecretConfig(path, {
        chatBaseUrl: "http://127.0.0.1:11434/v2",
        chatModel: "model-2",
        apiKey: "",
        transcriptionBaseUrl: "",
        transcriptionModel: "",
      })

      expect(statSync(path).mode & 0o777).toBe(0o600)
    },
  )

  it("treats malformed local configuration as unconfigured", () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-secrets-invalid-"))
    directories.push(directory)
    const path = join(directory, "secrets.json")
    writeFileSync(path, "{not-json", { mode: 0o600 })

    expect(getAiConfigStatus(path)).toEqual(
      expect.objectContaining({ configured: false, hasApiKey: false }),
    )
  })
})
