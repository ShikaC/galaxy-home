import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { z } from "zod"

const migrationRowSchema = z
  .object({ version: z.number().int().nonnegative().nullable() })
  .optional()

export class MigrationError extends Error {
  readonly name = "MigrationError"

  constructor(
    readonly migration: string,
    cause: unknown,
  ) {
    super(`Migration failed: ${migration}`, { cause })
  }
}

export function openDatabase(path: string) {
  const database = new DatabaseSync(path)
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000")
  return database
}

export function migrateDatabase(
  database: DatabaseSync,
  migrationsDirectory = resolve(process.cwd(), "db/migrations"),
) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  )
  const row = migrationRowSchema.parse(
    database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get(),
  )
  const currentVersion = row?.version ?? 0
  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort()

  for (const migration of migrations) {
    const version = Number.parseInt(migration.slice(0, migration.indexOf("_")), 10)
    if (version <= currentVersion) {
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
