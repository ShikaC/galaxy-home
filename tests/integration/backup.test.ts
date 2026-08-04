import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, unzipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createManualExport, restoreManualExport } from "../../src/server/services/backup.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

const directories: string[] = []
afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { force: true, recursive: true })
  })
})

describe("manual backup", () => {
  it("exports versioned data without the locally stored API key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-backup-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    writeSecretConfig(join(directory, "secrets.json"), {
      chatBaseUrl: "https://example.com/v1",
      chatModel: "model",
      apiKey: "must-not-export",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    })
    const bytes = createManualExport(database)
    const content = strFromU8(unzipSync(bytes)["galaxy-home.json"] ?? new Uint8Array())
    expect(content).toContain('"schemaVersion":1')
    expect(content).not.toContain("must-not-export")
    await expect(
      restoreManualExport(database, new Uint8Array([1, 2, 3]), directory),
    ).rejects.toThrow()
    expect(database.prepare("SELECT COUNT(*) AS count FROM workspace_settings").get()).toEqual({
      count: 1,
    })
    database.close()
  })
})
