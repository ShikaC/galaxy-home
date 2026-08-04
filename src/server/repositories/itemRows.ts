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

const itemRowSchema = z.object({
  id: itemIdSchema,
  title: z.string(),
  notes: z.string().nullable(),
  due_at: z.string().nullable(),
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

  return itemSchema.parse({
    id: parsed.id,
    title: parsed.title,
    notes: parsed.notes,
    dueAt: parsed.due_at,
    reminderMinutes: parsed.reminder_minutes,
    status: parsed.status,
    completedAt: parsed.completed_at,
    categoryIds: categories,
    projectIds: projects,
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
) {
  return rows.map((row) => readItem(database, row, localDate))
}
