import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"

export const searchResultSchema = z.object({
  id: z.string(),
  type: z.enum(["item", "category", "project", "habit", "gain", "review", "conversation"]),
  title: z.string(),
  detail: z.string().nullable(),
  date: z.string().nullable(),
})

export function searchWorkspace(database: DatabaseSync, search: string) {
  const like = `%${search.trim()}%`
  if (search.trim() === "") return []
  return database
    .prepare(
      `SELECT id, 'item' AS type, title, notes AS detail, substr(created_at, 1, 10) AS date FROM items WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)
     UNION ALL SELECT id, 'category', name, NULL, substr(created_at, 1, 10) FROM categories WHERE deleted_at IS NULL AND name LIKE ?
     UNION ALL SELECT id, 'project', name, desired_outcome, substr(updated_at, 1, 10) FROM projects WHERE deleted_at IS NULL AND (name LIKE ? OR desired_outcome LIKE ?)
     UNION ALL SELECT id, 'habit', name, NULL, substr(created_at, 1, 10) FROM habits WHERE deleted_at IS NULL AND name LIKE ?
     UNION ALL SELECT id, 'gain', content, NULL, local_date FROM daily_gains WHERE deleted_at IS NULL AND content LIKE ?
     UNION ALL SELECT id, 'review', summary, obstacles_json, week_start FROM weekly_reviews WHERE deleted_at IS NULL AND summary LIKE ?
     UNION ALL SELECT id, 'conversation', title, NULL, substr(updated_at, 1, 10) FROM ai_conversations WHERE deleted_at IS NULL AND title LIKE ?
     ORDER BY date DESC LIMIT 100`,
    )
    .all(like, like, like, like, like, like, like, like, like)
    .map((row) => searchResultSchema.parse(row))
}
