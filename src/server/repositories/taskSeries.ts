import type { DatabaseSync, SQLOutputValue } from "node:sqlite"
import { z } from "zod"
import {
  type CreateTaskSeriesInput,
  recurrenceReminderInputSchema,
  recurrenceRuleSchema,
  type TaskSeries,
  taskSeriesSchema,
} from "../../shared/recurrence.js"

const seriesRowSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  title: z.string(),
  notes: z.string().nullable(),
  priority: z.enum(["none", "low", "medium", "high"]),
  category_ids_json: z.string(),
  project_ids_json: z.string(),
  timezone: z.string(),
  start_date: z.string(),
  rule_json: z.string(),
  estimated_minutes: z.number().int().nullable(),
  due_time: z.string().nullable(),
  reminder_minutes: z.number().int().nullable(),
  reminder_rules_json: z.string(),
  status: z.enum(["active", "paused"]),
  materialized_through_date: z.string().nullable(),
  materialization_error_json: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

const relationIdRowSchema = z.object({ id: z.string() })

export class TaskSeriesNotFoundError extends Error {
  readonly name = "TaskSeriesNotFoundError"
  constructor(readonly seriesId: string) {
    super(`Task series not found: ${seriesId}`)
  }
}

function parseJson(value: string): unknown {
  return JSON.parse(value)
}

function readSeries(row: Record<string, SQLOutputValue>): TaskSeries {
  const parsed = seriesRowSchema.parse(row)
  return taskSeriesSchema.parse({
    id: parsed.id,
    version: parsed.version,
    title: parsed.title,
    notes: parsed.notes,
    priority: parsed.priority,
    categoryIds: z.array(z.string().uuid()).parse(parseJson(parsed.category_ids_json)),
    projectIds: z.array(z.string().uuid()).parse(parseJson(parsed.project_ids_json)),
    timezone: parsed.timezone,
    startDate: parsed.start_date,
    rule: recurrenceRuleSchema.parse(parseJson(parsed.rule_json)),
    estimatedMinutes: parsed.estimated_minutes,
    dueTime: parsed.due_time,
    reminderMinutes: parsed.reminder_minutes,
    reminders: z.array(recurrenceReminderInputSchema).parse(parseJson(parsed.reminder_rules_json)),
    status: parsed.status,
    materializedThroughDate: parsed.materialized_through_date,
    materializationError:
      parsed.materialization_error_json === null
        ? null
        : parseJson(parsed.materialization_error_json),
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  })
}

export function getTaskSeries(database: DatabaseSync, seriesId: string): TaskSeries {
  const series = findTaskSeries(database, seriesId)
  if (series === null) throw new TaskSeriesNotFoundError(seriesId)
  return series
}

export function findTaskSeries(database: DatabaseSync, seriesId: string): TaskSeries | null {
  const row = database
    .prepare("SELECT * FROM task_series WHERE id = ? AND deleted_at IS NULL")
    .get(seriesId)
  return row === undefined ? null : readSeries(row)
}

export function listTaskSeries(database: DatabaseSync): readonly TaskSeries[] {
  return database
    .prepare("SELECT * FROM task_series WHERE deleted_at IS NULL ORDER BY created_at, id")
    .all()
    .map(readSeries)
}

export function listActiveTaskSeries(database: DatabaseSync): readonly TaskSeries[] {
  return database
    .prepare("SELECT * FROM task_series WHERE status = 'active' AND deleted_at IS NULL ORDER BY id")
    .all()
    .map(readSeries)
}

export function existingSeriesRelationIds(
  database: DatabaseSync,
  table: "categories" | "projects",
  ids: readonly string[],
): readonly string[] {
  if (ids.length === 0) return ids
  const existing = new Set(
    database
      .prepare(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids)
      .map((row) => relationIdRowSchema.parse(row).id),
  )
  return ids.filter((id) => existing.has(id))
}

export function insertTaskSeries(
  database: DatabaseSync,
  input: CreateTaskSeriesInput,
  instant: Date,
): TaskSeries {
  const now = instant.toISOString()
  database
    .prepare(
      `INSERT INTO task_series
       (id, title, notes, priority, category_ids_json, project_ids_json, timezone, start_date,
        rule_json, estimated_minutes, due_time, reminder_minutes, reminder_rules_json,
        create_request_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      input.requestId,
      input.title,
      input.notes ?? null,
      input.priority,
      JSON.stringify(input.categoryIds),
      JSON.stringify(input.projectIds),
      input.timezone,
      input.startDate,
      JSON.stringify(input.rule),
      input.estimatedMinutes ?? null,
      input.dueTime ?? null,
      input.reminderMinutes ?? null,
      JSON.stringify(input.reminders),
      JSON.stringify(input),
      now,
      now,
    )
  return getTaskSeries(database, input.requestId)
}

export function getTaskSeriesCreateRequest(database: DatabaseSync, seriesId: string): unknown {
  const row = z
    .object({ create_request_json: z.string() })
    .parse(
      database.prepare("SELECT create_request_json FROM task_series WHERE id = ?").get(seriesId),
    )
  return parseJson(row.create_request_json)
}

export function replaceTaskSeries(
  database: DatabaseSync,
  series: TaskSeries,
  expectedVersion: number,
  instant: Date,
): boolean {
  const result = database
    .prepare(
      `UPDATE task_series SET version = version + 1, title = ?, notes = ?, priority = ?,
       category_ids_json = ?, project_ids_json = ?, timezone = ?, rule_json = ?,
       estimated_minutes = ?, due_time = ?, reminder_minutes = ?, reminder_rules_json = ?,
       status = ?, updated_at = ? WHERE id = ? AND version = ? AND deleted_at IS NULL`,
    )
    .run(
      series.title,
      series.notes,
      series.priority,
      JSON.stringify(series.categoryIds),
      JSON.stringify(series.projectIds),
      series.timezone,
      JSON.stringify(series.rule),
      series.estimatedMinutes,
      series.dueTime,
      series.reminderMinutes,
      JSON.stringify(series.reminders),
      series.status,
      instant.toISOString(),
      series.id,
      expectedVersion,
    )
  return result.changes === 1
}

export function recordSeriesMaterialization(
  database: DatabaseSync,
  seriesId: string,
  throughDate: string,
  error: unknown | null,
): void {
  if (error !== null) {
    database
      .prepare("UPDATE task_series SET materialization_error_json = ? WHERE id = ?")
      .run(JSON.stringify(error), seriesId)
    return
  }
  database
    .prepare(
      `UPDATE task_series SET materialized_through_date = CASE
       WHEN materialized_through_date IS NULL OR materialized_through_date < ? THEN ?
       ELSE materialized_through_date END, materialization_error_json = NULL WHERE id = ?`,
    )
    .run(throughDate, throughDate, seriesId)
}
