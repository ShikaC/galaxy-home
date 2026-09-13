import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { z } from "zod"

const migrationRowSchema = z
  .object({ version: z.number().int().nonnegative().nullable() })
  .optional()

const tableRowSchema = z.object({ value: z.number().int() })

export type MigrationState = {
  readonly currentVersion: number
  readonly supportedVersion: number
  readonly pending: boolean
}

export class MigrationError extends Error {
  readonly name = "MigrationError"

  constructor(
    readonly migration: string,
    cause: unknown,
  ) {
    super(`Migration failed: ${migration}`, { cause })
  }
}

export class UnsupportedDatabaseVersionError extends Error {
  readonly name = "UnsupportedDatabaseVersionError"

  constructor(
    readonly currentVersion: number,
    readonly supportedVersion: number,
  ) {
    super(`Database schema v${currentVersion} is newer than supported v${supportedVersion}`)
  }
}

function migrationFiles(migrationsDirectory: string): readonly string[] {
  return readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort()
}

function migrationVersion(file: string): number {
  return Number.parseInt(file.slice(0, file.indexOf("_")), 10)
}

export function openDatabase(path: string) {
  const database = new DatabaseSync(path)
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000")
  return database
}

export function inspectMigrationState(
  database: DatabaseSync,
  migrationsDirectory = resolve(process.cwd(), "db/migrations"),
): MigrationState {
  const files = migrationFiles(migrationsDirectory)
  const supportedVersion =
    files.length === 0 ? 0 : migrationVersion(files[files.length - 1] ?? "0_")
  const hasMigrationTable = tableRowSchema.parse(
    database
      .prepare(
        "SELECT COUNT(*) AS value FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      )
      .get(),
  ).value
  const row =
    hasMigrationTable === 0
      ? undefined
      : migrationRowSchema.parse(
          database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get(),
        )
  const currentVersion = row?.version ?? 0
  if (currentVersion > supportedVersion)
    throw new UnsupportedDatabaseVersionError(currentVersion, supportedVersion)
  return { currentVersion, supportedVersion, pending: currentVersion < supportedVersion }
}

export function migrateDatabase(
  database: DatabaseSync,
  migrationsDirectory = resolve(process.cwd(), "db/migrations"),
) {
  const state = inspectMigrationState(database, migrationsDirectory)
  database.exec("PRAGMA journal_mode = WAL")
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  )
  const migrations = migrationFiles(migrationsDirectory)

  for (const migration of migrations) {
    const version = migrationVersion(migration)
    if (version <= state.currentVersion) {
      continue
    }
    const sql = readFileSync(resolve(migrationsDirectory, migration), "utf8")
    database.exec("BEGIN IMMEDIATE")
    try {
      database.exec(sql)
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(version, new Date().toISOString())
      database.exec("COMMIT")
    } catch (error) {
      database.exec("ROLLBACK")
      throw new MigrationError(migration, error)
    }
  }
}
