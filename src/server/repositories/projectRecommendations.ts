import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { itemIdSchema } from "../../shared/items.js"
import { getItem } from "./items.js"
import { getProject } from "./projects.js"
import { addToTodayOrSecondary } from "./todayItems.js"

const itemRowSchema = z.object({ id: itemIdSchema }).optional()

export class ProjectTaskNotRecommendedError extends Error {
  readonly name = "ProjectTaskNotRecommendedError"
}

export function addCurrentProjectTaskToToday(
  database: DatabaseSync,
  projectId: string,
  localDate: string,
) {
  const project = getProject(database, projectId)
  if (project.currentTask === null) {
    throw new ProjectTaskNotRecommendedError("当前没有可加入今日的任务")
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
  const itemId = existing?.id ?? insertLinkedItem(database, project.id, project.currentTask.title)
  addToTodayOrSecondary(database, itemId, localDate)
  return getItem(database, itemId, localDate)
}

function insertLinkedItem(database: DatabaseSync, projectId: string, title: string) {
  const itemId = itemIdSchema.parse(crypto.randomUUID())
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `INSERT INTO items (id, title, status, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`,
      )
      .run(itemId, title, now, now)
    database
      .prepare("INSERT INTO item_projects (item_id, project_id) VALUES (?, ?)")
      .run(itemId, projectId)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return itemId
}
