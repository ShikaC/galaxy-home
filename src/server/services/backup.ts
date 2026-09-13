import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { backup, type DatabaseSync, type SQLOutputValue } from "node:sqlite"
import { format, parseISO, subDays } from "date-fns"
import { strToU8, zipSync } from "fflate"
import type { MigrationState } from "../database.js"
import { DATA_TABLES } from "./backupSchema.js"

export async function ensureDailyBackup(
  database: DatabaseSync,
  directory: string,
  localDate: string,
  retentionDays: number,
): Promise<string> {
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `${localDate}.sqlite`)
  if (!existsSync(path)) await backup(database, path)
  const oldestRetainedDate = format(subDays(parseISO(localDate), retentionDays - 1), "yyyy-MM-dd")
  const files = readdirSync(directory)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.sqlite$/.test(file))
    .sort()
  for (const file of files) {
    if (file.slice(0, 10) < oldestRetainedDate) rmSync(join(directory, file))
  }
  return path
}

export async function ensurePreMigrationBackup(
  database: DatabaseSync,
  directory: string,
  state: MigrationState,
): Promise<string | null> {
  if (!state.pending || state.currentVersion === 0) return null
  mkdirSync(directory, { recursive: true })
  const timestamp = new Date().toISOString().replaceAll(/[-:]/g, "").slice(0, 15)
  const path = join(
    directory,
    `upgrade-v${state.currentVersion}-to-v${state.supportedVersion}-${timestamp}-${randomUUID()}.sqlite`,
  )
  await backup(database, path)
  return path
}

export function getBackupStatus(directory: string) {
  if (!existsSync(directory)) return { latestAt: null, sizeBytes: 0 }
  const files = readdirSync(directory).filter((file) => /^\d{4}-\d{2}-\d{2}\.sqlite$/.test(file))
  const stats = files.map((file) => statSync(join(directory, file)))
  return {
    latestAt:
      stats.length === 0
        ? null
        : new Date(Math.max(...stats.map((value) => value.mtimeMs))).toISOString(),
    sizeBytes: stats.reduce((sum, value) => sum + value.size, 0),
  }
}

export function createManualExport(database: DatabaseSync): Uint8Array {
  const tables: Record<string, readonly Record<string, SQLOutputValue>[]> = {}
  for (const table of DATA_TABLES) tables[table] = database.prepare(`SELECT * FROM ${table}`).all()
  const payload = JSON.stringify(
    { schemaVersion: 2, exportedAt: new Date().toISOString(), tables },
    (_key, value: unknown) => {
      if (value instanceof Uint8Array) throw new Error("导出暂不支持二进制字段")
      return typeof value === "bigint" ? Number(value) : value
    },
  )
  return zipSync({ "galaxy-home.json": strToU8(payload) }, { level: 6 })
}

export {
  ImportArchiveInvalidError,
  ImportArchiveMalformedError,
  ImportArchiveTooLargeError,
  MAX_IMPORT_UNCOMPRESSED_BYTES,
} from "./backupArchive.js"
export { restoreManualExport } from "./backupRestore.js"
