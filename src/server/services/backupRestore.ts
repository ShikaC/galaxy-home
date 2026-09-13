import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { backup, type DatabaseSync } from "node:sqlite"
import { strFromU8 } from "fflate"
import { z } from "zod"
import { planRunSchema } from "../../shared/planning.js"
import { taskPlanRunSchema } from "../../shared/taskPlanning.js"
import {
  extractImportPayload,
  ImportArchiveInvalidError,
  ImportArchiveMalformedError,
  ImportArchiveTooLargeError,
} from "./backupArchive.js"
import { DATA_TABLE_SET, DATA_TABLES, exportSchema } from "./backupSchema.js"
import { validateTaskArchiveRows, verifyRestoredTasks } from "./backupTaskValidation.js"

export async function restoreManualExport(
  database: DatabaseSync,
  bytes: Uint8Array,
  backupDirectory: string,
): Promise<void> {
  let data: z.infer<typeof exportSchema>
  try {
    const file = await extractImportPayload(bytes)
    data = exportSchema.parse(JSON.parse(strFromU8(file)))
  } catch (error) {
    if (error instanceof ImportArchiveTooLargeError) throw error
    throw new ImportArchiveMalformedError(error)
  }
  for (const table of DATA_TABLES)
    if (
      data.tables[table] === undefined &&
      table !== "workspace_notes" &&
      table !== "plan_runs" &&
      !(
        data.schemaVersion === 1 &&
        [
          "notification_snooze_requests",
          "item_create_requests",
          "task_series",
          "task_occurrences",
          "task_reminder_rules",
          "task_plan_runs",
        ].includes(table)
      )
    )
      throw new ImportArchiveMalformedError(new Error(`导入文件缺少 ${table}`))
  for (const table of Object.keys(data.tables)) {
    if (!DATA_TABLE_SET.has(table)) throw new ImportArchiveInvalidError(table)
    const columns = new Set(
      database
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => z.object({ name: z.string() }).parse(row).name),
    )
    for (const row of data.tables[table] ?? []) {
      if (table === "plan_runs" || table === "task_plan_runs") {
        try {
          const stored = z
            .object({
              id: z.uuid(),
              state_json: z.string(),
              created_at: z.string(),
              updated_at: z.string(),
            })
            .parse(row)
          const run =
            table === "plan_runs"
              ? planRunSchema.parse(JSON.parse(stored.state_json))
              : taskPlanRunSchema.parse(JSON.parse(stored.state_json))
          if (
            run.id !== stored.id ||
            run.input.requestId !== run.id ||
            run.createdAt !== stored.created_at ||
            run.updatedAt !== stored.updated_at
          )
            throw new Error("Mismatched run metadata")
        } catch (error) {
          throw new ImportArchiveMalformedError(error)
        }
      }
      const rowColumns = Object.keys(row)
      if (rowColumns.length === 0) throw new ImportArchiveInvalidError(table)
      if (table === "items" && data.schemaVersion >= 2) {
        const required = [
          "id",
          "title",
          "notes",
          "due_at",
          "due_date",
          "reminder_minutes",
          "status",
          "priority",
          "parent_id",
          "estimated_minutes",
          "scheduled_start_at",
          "scheduled_end_at",
          "schedule_timezone",
          "is_fixed",
          "completed_at",
          "sort_order",
          "is_tutorial",
          "created_at",
          "updated_at",
          "deleted_at",
          "version",
        ]
        const missing = required.find((column) => !rowColumns.includes(column))
        if (missing !== undefined) throw new ImportArchiveInvalidError(table, missing)
      }
      const unknownColumn = rowColumns.find((column) => !columns.has(column))
      if (unknownColumn !== undefined) throw new ImportArchiveInvalidError(table, unknownColumn)
    }
  }
  validateTaskArchiveRows(data.tables)
  mkdirSync(backupDirectory, { recursive: true })
  await backup(database, join(backupDirectory, `restore-${Date.now()}.sqlite`))
  database.exec("BEGIN IMMEDIATE")
  try {
    database.exec("PRAGMA defer_foreign_keys = ON")
    for (const table of [...DATA_TABLES].reverse()) database.exec(`DELETE FROM ${table}`)
    for (const table of DATA_TABLES) {
      const rows = data.tables[table] ?? []
      for (const row of rows) {
        if (table === "plan_runs" || table === "task_plan_runs") {
          row["owner_pid"] = 0
          row["lease_until_ms"] = 0
        }
        if (table === "task_plan_runs") {
          const run = taskPlanRunSchema.parse(JSON.parse(z.string().parse(row["state_json"])))
          if (["planning", "awaiting_confirmation", "needs_input"].includes(run.status)) {
            row["state_json"] = JSON.stringify({
              ...run,
              status: "cancelled",
              error: {
                code: "RESTORED_WORKSPACE",
                message: "工作区已恢复，请重新生成建议",
                retryable: true,
              },
            })
          }
        }
        const columns = Object.keys(row)
        const identifiers = columns.map((column) => `"${column}"`).join(",")
        database
          .prepare(
            `INSERT INTO ${table} (${identifiers}) VALUES (${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((column) => row[column] ?? null))
      }
    }
    if (data.schemaVersion === 1) {
      database.exec(`INSERT OR IGNORE INTO task_reminder_rules
        (id,item_id,anchor,offset_minutes,created_at,updated_at)
        SELECT 'legacy-due:' || id,id,'due',reminder_minutes,created_at,updated_at FROM items
        WHERE reminder_minutes IS NOT NULL AND due_at IS NOT NULL`)
    }
    for (const row of data.tables["items"] ?? []) {
      database
        .prepare("UPDATE items SET version = ? WHERE id = ?")
        .run(row["version"] ?? 1, row["id"] ?? null)
    }
    verifyRestoredTasks(database)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
