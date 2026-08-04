import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { itemIdSchema } from "../../shared/items.js"
import { getItem } from "./items.js"
import { getProject } from "./projects.js"
import { setTodayItem, TodayLimitError } from "./todayItems.js"

const itemRowSchema = z.object({ id: itemIdSchema }).optional()
const countRowSchema = z.object({ count: z.number().int().nonnegative() })

export class ProjectTaskNotRecommendedError extends Error {
  readonly name = "ProjectTaskNotRecommendedError"
}

export function addAiProjectTaskToToday(
  database: DatabaseSync,
  projectId: string,
  localDate: string,
) {
  const project = getProject(database, projectId)
  if (project.currentTask === null || project.currentTask.source !== "ai") {
    throw new ProjectTaskNotRecommendedError("当前没有可加入今日的 AI 推荐任务")
  }
  const existing = itemRowSchema.parse(
    database
      .prepare(
        `SELECT items.id FROM items
         JOIN item_projects ON item_projects.item_id = items.id
         WHERE item_projects.project_id = ? AND items.title = ?
           AND items.status = 'active' AND items.deleted_at IS NULL
         ORDER BY items.created_at DESC LIMIT 1`,
      )
      .get(project.id, project.currentTask.title),
  )
  if (existing !== undefined) {
    setTodayItem(database, {
      itemId: existing.id,
      localDate,
      isFocus: false,
      isSecondary: false,
    })
    return getItem(database, existing.id, localDate)
  }

  const primaryCount = countRowSchema.parse(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM today_items
         JOIN items ON items.id = today_items.item_id
         WHERE today_items.local_date = ? AND today_items.is_secondary = 0
           AND items.status = 'active' AND items.deleted_at IS NULL`,
      )
      .get(localDate),
  ).count
  if (primaryCount >= 3) throw new TodayLimitError()

  const itemId = itemIdSchema.parse(crypto.randomUUID())
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `INSERT INTO items (id, title, status, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`,
      )
      .run(itemId, project.currentTask.title, now, now)
    database
      .prepare("INSERT INTO item_projects (item_id, project_id) VALUES (?, ?)")
      .run(itemId, project.id)
    database
      .prepare(
        `INSERT INTO today_items (local_date, item_id, sort_order, is_focus, is_secondary)
         VALUES (?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM today_items WHERE local_date = ?), 0), 0, 0)`,
      )
      .run(localDate, itemId, localDate)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return getItem(database, itemId, localDate)
}
