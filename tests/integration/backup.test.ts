import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  createManualExport,
  ensureDailyBackup,
  getBackupStatus,
  MAX_IMPORT_UNCOMPRESSED_BYTES,
  restoreManualExport,
} from "../../src/server/services/backup.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

const directories: string[] = []
afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { force: true, recursive: true })
  })
})

describe("manual backup", () => {
  it("rejects archives whose extracted content exceeds the safety limit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-oversized-import-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const bytes = zipSync({
      "galaxy-home.json": strToU8("x".repeat(MAX_IMPORT_UNCOMPRESSED_BYTES + 1)),
    })

    await expect(
      restoreManualExport(database, bytes, join(directory, "backups")),
    ).rejects.toMatchObject({ name: "ImportArchiveTooLargeError" })
    expect(database.prepare("SELECT COUNT(*) AS count FROM workspace_settings").get()).toEqual({
      count: 1,
    })
    database.close()
  })

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

  it("restores exported business data after creating a recovery point", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-restore-"))
    directories.push(directory)
    const backupDirectory = join(directory, "backups")
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    database
      .prepare("UPDATE workspace_settings SET workspace_name = ? WHERE id = 1")
      .run("导出时空间")
    const itemId = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    database
      .prepare(
        `INSERT INTO items (id, title, status, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`,
      )
      .run(itemId, "导出前的真实待办", timestamp, timestamp)
    const bytes = createManualExport(database)
    database
      .prepare("UPDATE workspace_settings SET workspace_name = ? WHERE id = 1")
      .run("恢复前空间")
    database.prepare("DELETE FROM items WHERE id = ?").run(itemId)

    await restoreManualExport(database, bytes, backupDirectory)

    expect(
      database.prepare("SELECT workspace_name FROM workspace_settings WHERE id = 1").get(),
    ).toEqual({ workspace_name: "导出时空间" })
    expect(database.prepare("SELECT title FROM items WHERE id = ?").get(itemId)).toEqual({
      title: "导出前的真实待办",
    })
    expect(readdirSync(backupDirectory).some((file) => /^restore-\d+\.sqlite$/.test(file))).toBe(
      true,
    )
    database.close()
  })

  it("expires only dated automatic snapshots and reports only their size", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-retention-"))
    directories.push(directory)
    const backupDirectory = join(directory, "backups")
    mkdirSync(backupDirectory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    writeFileSync(join(backupDirectory, "2026-07-01.sqlite"), "expired")
    writeFileSync(join(backupDirectory, "2026-07-30.sqlite"), "kept")
    writeFileSync(join(backupDirectory, "restore-123.sqlite"), "restore-point")

    const currentPath = await ensureDailyBackup(database, backupDirectory, "2026-08-04", 7)
    const status = getBackupStatus(backupDirectory)

    expect(() => statSync(join(backupDirectory, "2026-07-01.sqlite"))).toThrow()
    expect(statSync(join(backupDirectory, "2026-07-30.sqlite")).isFile()).toBe(true)
    expect(statSync(join(backupDirectory, "restore-123.sqlite")).isFile()).toBe(true)
    expect(status.sizeBytes).toBe(
      statSync(join(backupDirectory, "2026-07-30.sqlite")).size + statSync(currentPath).size,
    )
    database.close()
  })
})
