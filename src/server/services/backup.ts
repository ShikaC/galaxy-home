import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { backup, type DatabaseSync, type SQLOutputValue } from "node:sqlite"
import { format, parseISO, subDays } from "date-fns"
import { strFromU8, strToU8, type UnzipFileInfo, unzipSync, zipSync } from "fflate"
import { z } from "zod"

export const MAX_IMPORT_UNCOMPRESSED_BYTES = 32 * 1024 * 1024

export class ImportArchiveTooLargeError extends Error {
  readonly name = "ImportArchiveTooLargeError"

  constructor(readonly limitBytes: number) {
    super(`导入文件解压后超过 ${limitBytes} 字节上限`)
  }
}

export class ImportArchiveInvalidError extends Error {
  readonly name = "ImportArchiveInvalidError"

  constructor(
    readonly table: string,
    readonly column?: string,
  ) {
    super(
      column === undefined
        ? `导入表 ${table} 的行字段为空`
        : `导入表 ${table} 含未知字段 ${column}`,
    )
  }
}

const DATA_TABLES = [
  "workspace_settings",
  "quotes",
  "daily_quote_selections",
  "categories",
  "items",
  "projects",
  "item_categories",
  "item_projects",
  "today_items",
  "project_stages",
  "project_tasks",
  "project_feedback",
  "project_ai_sessions",
  "habits",
  "habit_schedules",
  "habit_logs",
  "habit_exceptions",
  "daily_gains",
  "weekly_reviews",
  "review_suggestion_conversions",
  "ai_conversations",
  "ai_messages",
  "ai_memories",
  "ai_action_log",
  "reminders",
  "notification_events",
  "scheduler_state",
  "trash_entries",
  "tutorial_state",
] as const

const DATA_TABLE_SET = new Set<string>(DATA_TABLES)

const exportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  tables: z.record(
    z.string(),
    z.array(z.record(z.string(), z.union([z.string(), z.number(), z.bigint(), z.null()]))),
  ),
})

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
    { schemaVersion: 1, exportedAt: new Date().toISOString(), tables },
    (_key, value: unknown) => {
      if (value instanceof Uint8Array) throw new Error("导出暂不支持二进制字段")
      return typeof value === "bigint" ? Number(value) : value
    },
  )
  return zipSync({ "galaxy-home.json": strToU8(payload) }, { level: 6 })
}

export async function restoreManualExport(
  database: DatabaseSync,
  bytes: Uint8Array,
  backupDirectory: string,
): Promise<void> {
  let uncompressedBytes = 0
  const file = unzipSync(bytes, {
    filter: (entry: UnzipFileInfo) => {
      if (entry.name !== "galaxy-home.json") return false
      uncompressedBytes += entry.originalSize
      if (uncompressedBytes > MAX_IMPORT_UNCOMPRESSED_BYTES)
        throw new ImportArchiveTooLargeError(MAX_IMPORT_UNCOMPRESSED_BYTES)
      return true
    },
  })["galaxy-home.json"]
  if (file === undefined) throw new Error("导入文件缺少 galaxy-home.json")
  const data = exportSchema.parse(JSON.parse(strFromU8(file)))
  for (const table of DATA_TABLES)
    if (data.tables[table] === undefined) throw new Error(`导入文件缺少 ${table}`)
  for (const table of Object.keys(data.tables)) {
    if (!DATA_TABLE_SET.has(table)) throw new ImportArchiveInvalidError(table)
    const columns = new Set(
      database
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => z.object({ name: z.string() }).parse(row).name),
    )
    for (const row of data.tables[table] ?? []) {
      const rowColumns = Object.keys(row)
      if (rowColumns.length === 0) throw new ImportArchiveInvalidError(table)
      const unknownColumn = rowColumns.find((column) => !columns.has(column))
      if (unknownColumn !== undefined) throw new ImportArchiveInvalidError(table, unknownColumn)
    }
  }
  mkdirSync(backupDirectory, { recursive: true })
  await backup(database, join(backupDirectory, `restore-${Date.now()}.sqlite`))
  database.exec("BEGIN IMMEDIATE")
  try {
    for (const table of [...DATA_TABLES].reverse()) database.exec(`DELETE FROM ${table}`)
    for (const table of DATA_TABLES) {
      const rows = data.tables[table] ?? []
      for (const row of rows) {
        const columns = Object.keys(row)
        const identifiers = columns.map((column) => `"${column}"`).join(",")
        database
          .prepare(
            `INSERT INTO ${table} (${identifiers}) VALUES (${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((column) => row[column] ?? null))
      }
    }
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
