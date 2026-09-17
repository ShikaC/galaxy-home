import type { DatabaseSync, SQLOutputValue } from "node:sqlite"
import { z } from "zod"
import {
  categoryIdSchema,
  type Item,
  itemIdSchema,
  itemSchema,
  itemStatusSchema,
  projectIdSchema,
} from "../../shared/items.js"
import { reminderAnchorSchema, taskPrioritySchema } from "../../shared/taskCore.js"

const itemRowSchema = z.object({
  id: itemIdSchema,
  version: z.number().int().positive(),
  title: z.string(),
  notes: z.string().nullable(),
  priority: taskPrioritySchema,
  parent_id: itemIdSchema.nullable(),
  due_at: z.string().nullable(),
  due_date: z.string().nullable(),
  estimated_minutes: z.number().int().nullable(),
  scheduled_start_at: z.string().nullable(),
  scheduled_end_at: z.string().nullable(),
  schedule_timezone: z.string().nullable(),
  is_fixed: z.number().int(),
  reminder_minutes: z.number().int().nullable(),
  status: itemStatusSchema,
  completed_at: z.string().nullable(),
  is_tutorial: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
})
const categoryRelationSchema = z.object({ category_id: categoryIdSchema })
const projectRelationSchema = z.object({ project_id: projectIdSchema })
const todayRelationSchema = z
  .object({ is_focus: z.number().int(), is_secondary: z.number().int() })
  .optional()
const occurrenceSchema = z
  .object({
    series_id: z.uuid(),
    occurrence_date: z.string(),
    status: z.enum(["active", "skipped"]),
  })
  .optional()
const countSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
})
const reminderSchema = z.object({
  id: z.string(),
  anchor: reminderAnchorSchema,
  offset_minutes: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  enabled: z.number().int(),
})

export function readItem(
  database: DatabaseSync,
  row: Record<string, SQLOutputValue>,
  localDate: string,
): Item {
  const parsed = itemRowSchema.parse(row)
  const categories = database
    .prepare(
      "SELECT category_id FROM item_categories WHERE item_id = ? ORDER BY sort_order, category_id",
    )
    .all(parsed.id)
    .map((relation) => categoryRelationSchema.parse(relation).category_id)
  const projects = database
    .prepare("SELECT project_id FROM item_projects WHERE item_id = ? ORDER BY project_id")
    .all(parsed.id)
    .map((relation) => projectRelationSchema.parse(relation).project_id)
  const today = todayRelationSchema.parse(
    database
      .prepare(
        "SELECT is_focus, is_secondary FROM today_items WHERE item_id = ? AND local_date = ?",
      )
      .get(parsed.id, localDate),
  )
  const occurrence = occurrenceSchema.parse(
    database
      .prepare("SELECT series_id, occurrence_date, status FROM task_occurrences WHERE item_id = ?")
      .get(parsed.id),
  )
  const subtasks = countSchema.parse(
    database
      .prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed FROM items WHERE parent_id = ? AND deleted_at IS NULL",
      )
      .get(parsed.id),
  )
  const reminders = database
    .prepare(
      "SELECT id, anchor, offset_minutes, version, enabled FROM task_reminder_rules WHERE item_id = ? ORDER BY anchor, offset_minutes, id",
    )
    .all(parsed.id)
    .map((raw) => {
      const rule = reminderSchema.parse(raw)
      return {
        id: rule.id,
        anchor: rule.anchor,
        offsetMinutes: rule.offset_minutes,
        version: rule.version,
        enabled: rule.enabled === 1,
      }
    })
  return itemSchema.parse({
    id: parsed.id,
    version: parsed.version,
    title: parsed.title,
    notes: parsed.notes,
    priority: parsed.priority,
    parentId: parsed.parent_id,
    dueAt: parsed.due_at,
    dueDate: parsed.due_date,
    estimatedMinutes: parsed.estimated_minutes,
    scheduledStartAt: parsed.scheduled_start_at,
    scheduledEndAt: parsed.scheduled_end_at,
    scheduleTimezone: parsed.schedule_timezone,
    isFixed: parsed.is_fixed === 1,
    reminderMinutes: parsed.reminder_minutes,
    reminders,
    status: parsed.status,
    completedAt: parsed.completed_at,
    categoryIds: categories,
    projectIds: projects,
    recurrenceSeriesId: occurrence?.series_id ?? null,
    recurrenceDate: occurrence?.occurrence_date ?? null,
    recurrenceStatus: occurrence?.status ?? null,
    subtaskCount: subtasks.total,
    completedSubtaskCount: subtasks.completed,
    isTutorial: parsed.is_tutorial === 1,
    inToday: today !== undefined,
    isFocus: today?.is_focus === 1,
    isSecondary: today?.is_secondary === 1,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  })
}

export function readItemRows(
  database: DatabaseSync,
  rows: readonly Record<string, SQLOutputValue>[],
  localDate: string,
): readonly Item[] {
  return rows.map((row) => readItem(database, row, localDate))
}
