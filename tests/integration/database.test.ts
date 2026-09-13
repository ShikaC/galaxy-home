import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import {
  inspectMigrationState,
  migrateDatabase,
  openDatabase,
  UnsupportedDatabaseVersionError,
} from "../../src/server/database.js"
import { ensurePreMigrationBackup } from "../../src/server/services/backup.js"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("database migrations", () => {
  it("creates every core table on an empty database", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-database-"))
    temporaryDirectories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))

    // When
    migrateDatabase(database)

    // Then
    const rows = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
    const names = rows.map((row) => z.object({ name: z.string() }).parse(row).name)
    expect(names).toEqual(
      expect.arrayContaining([
        "workspace_settings",
        "items",
        "categories",
        "today_items",
        "projects",
        "habits",
        "habit_logs",
        "daily_gains",
        "weekly_reviews",
        "ai_conversations",
        "scheduler_state",
        "trash_entries",
      ]),
    )
    database.close()
  })

  it("refuses a database from a newer application version without modifying it", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-future-database-"))
    temporaryDirectories.push(directory)
    const path = join(directory, "app.sqlite")
    const database = openDatabase(path)
    database.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    )
    database.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(999, "future")
    database.close()
    const before = statFingerprint(path)
    const reopened = openDatabase(path)

    // When / Then
    expect(() => migrateDatabase(reopened)).toThrow(UnsupportedDatabaseVersionError)
    reopened.close()
    expect(statFingerprint(path)).toEqual(before)
  })

  it("rolls back a failed migration without recording its version", () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-failed-migration-"))
    temporaryDirectories.push(directory)
    const migrations = join(directory, "migrations")
    mkdirSync(migrations)
    writeFileSync(
      join(migrations, "001_valid.sql"),
      "CREATE TABLE preserved (id TEXT PRIMARY KEY);",
    )
    writeFileSync(
      join(migrations, "002_invalid.sql"),
      "CREATE TABLE rolled_back (id TEXT PRIMARY KEY); INSERT INTO missing_table VALUES (1);",
    )
    const database = openDatabase(join(directory, "app.sqlite"))

    // When / Then
    expect(() => migrateDatabase(database, migrations)).toThrowError(
      expect.objectContaining({ migration: "002_invalid.sql" }),
    )
    expect(database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual(
      {
        version: 1,
      },
    )
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'rolled_back'").get(),
    ).toBeUndefined()
    database.close()
  })

  it("backs up a legacy copy before applying any pending migration", async () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-home-legacy-upgrade-"))
    temporaryDirectories.push(directory)
    const database = createLegacyDatabase(directory)
    const id = crypto.randomUUID()
    const reminderId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const now = "2026-09-10T08:00:00.000Z"
    database
      .prepare(
        "INSERT INTO items(id,title,due_at,reminder_minutes,created_at,updated_at) VALUES (?,'legacy',?,30,?,?)",
      )
      .run(id, now, now, now)
    database
      .prepare(
        "INSERT INTO reminders(id,kind,entity_id,scheduled_at,created_at,updated_at) VALUES (?,'deadline',?,?,?,?)",
      )
      .run(reminderId, id, now, now, now)
    database
      .prepare(
        "INSERT INTO notification_events(id,reminder_id,kind,scheduled_at,delivered_at,created_at) VALUES (?,?,'deadline',?,?,?)",
      )
      .run(eventId, reminderId, now, now, now)
    const state = inspectMigrationState(database)

    // When
    const backupPath = await ensurePreMigrationBackup(database, join(directory, "backups"), state)

    migrateDatabase(database)

    // Then
    expect(
      database
        .prepare("SELECT id,anchor,offset_minutes FROM task_reminder_rules WHERE item_id=?")
        .get(id),
    ).toEqual({ id: `legacy-due:${id}`, anchor: "due", offset_minutes: 30 })
    expect(
      database.prepare("SELECT delivered_at FROM notification_events WHERE id=?").get(eventId),
    ).toEqual({ delivered_at: now })
    expect(database.prepare("SELECT due_at FROM items WHERE id=?").get(id)).toEqual({ due_at: now })
    expect(backupPath).toMatch(/upgrade-v\d+-to-v\d+-\d{8}T\d{6}-[a-f0-9-]+\.sqlite$/)
    if (backupPath === null) throw new Error("测试旧库应当需要升级快照")
    const backupDatabase = openDatabase(backupPath)
    expect(inspectMigrationState(backupDatabase).currentVersion).toBe(state.currentVersion)
    expect(backupDatabase.prepare("SELECT COUNT(*) AS count FROM items").get()).toEqual(
      database.prepare("SELECT COUNT(*) AS count FROM items").get(),
    )
    backupDatabase.close()
    database.close()
  })
  it("leaves the old schema unchanged when the pre-upgrade backup fails", async () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-backup-failure-"))
    temporaryDirectories.push(directory)
    const database = createLegacyDatabase(directory)
    const blockedDirectory = join(directory, "blocked")
    writeFileSync(blockedDirectory, "file blocks directory creation")
    const before = inspectMigrationState(database)
    // When / Then
    await expect(ensurePreMigrationBackup(database, blockedDirectory, before)).rejects.toThrow()
    expect(inspectMigrationState(database).currentVersion).toBe(8)
    database.close()
  })
})

function statFingerprint(path: string): { readonly size: number; readonly mtimeMs: number } {
  const stat = statSync(path)
  return { size: stat.size, mtimeMs: stat.mtimeMs }
}

function createLegacyDatabase(directory: string) {
  const migrations = join(directory, "legacy-migrations")
  mkdirSync(migrations)
  for (const file of readdirSync("db/migrations").filter((name) => Number.parseInt(name, 10) <= 8))
    copyFileSync(join("db/migrations", file), join(migrations, file))
  const database = openDatabase(join(directory, "legacy.sqlite"))
  migrateDatabase(database, migrations)
  return database
}
