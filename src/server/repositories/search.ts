import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"

export const searchResultSchema = z.object({
  id: z.string(),
  type: z.enum(["item", "category", "project", "habit", "gain", "review", "conversation"]),
  title: z.string(),
  detail: z.string().nullable(),
  date: z.string().nullable(),
})

export type SearchOptions = {
  readonly search: string
  readonly type?: z.infer<typeof searchResultSchema>["type"]
  readonly dateFrom?: string
  readonly dateTo?: string
}

const workspaceSnapshotQueries = [
  {
    type: "item",
    sql: `SELECT id, 'item' AS type, title, notes AS detail, substr(updated_at, 1, 10) AS date
      FROM items WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
  },
  {
    type: "category",
    sql: `SELECT id, 'category' AS type, name AS title, NULL AS detail, substr(updated_at, 1, 10) AS date
      FROM categories WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
  },
  {
    type: "project",
    sql: `SELECT id, 'project' AS type, name AS title, desired_outcome AS detail, substr(updated_at, 1, 10) AS date
      FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
  },
  {
    type: "habit",
    sql: `SELECT id, 'habit' AS type, name AS title, NULL AS detail, substr(updated_at, 1, 10) AS date
      FROM habits WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
  },
  {
    type: "gain",
    sql: `SELECT id, 'gain' AS type, content AS title, NULL AS detail, local_date AS date
      FROM daily_gains WHERE deleted_at IS NULL ORDER BY local_date DESC, created_at DESC LIMIT ?`,
  },
  {
    type: "review",
    sql: `SELECT id, 'review' AS type, summary AS title, obstacles_json AS detail, week_start AS date
      FROM weekly_reviews WHERE deleted_at IS NULL ORDER BY week_start DESC LIMIT ?`,
  },
  {
    type: "conversation",
    sql: `SELECT conversations.id, 'conversation' AS type, conversations.title,
      (SELECT content FROM ai_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS detail,
      substr(conversations.updated_at, 1, 10) AS date
      FROM ai_conversations AS conversations WHERE conversations.deleted_at IS NULL
      ORDER BY conversations.updated_at DESC LIMIT ?`,
  },
] as const

export function listWorkspaceContext(database: DatabaseSync, limitPerType = 4) {
  return workspaceSnapshotQueries.flatMap(({ sql }) =>
    database
      .prepare(sql)
      .all(limitPerType)
      .map((row) => searchResultSchema.parse(row)),
  )
}

export function searchWorkspace(database: DatabaseSync, options: SearchOptions) {
  const like = `%${options.search.trim()}%`
  if (options.search.trim() === "") return []
  const results = database
    .prepare(
      `SELECT id, 'item' AS type, title, notes AS detail, substr(created_at, 1, 10) AS date FROM items WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)
     UNION ALL SELECT id, 'category', name, NULL, substr(created_at, 1, 10) FROM categories WHERE deleted_at IS NULL AND name LIKE ?
     UNION ALL SELECT id, 'project', name, desired_outcome, substr(updated_at, 1, 10) FROM projects WHERE deleted_at IS NULL AND (name LIKE ? OR desired_outcome LIKE ?)
     UNION ALL SELECT id, 'habit', name, NULL, substr(created_at, 1, 10) FROM habits WHERE deleted_at IS NULL AND name LIKE ?
     UNION ALL SELECT id, 'gain', content, NULL, local_date FROM daily_gains WHERE deleted_at IS NULL AND content LIKE ?
     UNION ALL SELECT id, 'review', summary, obstacles_json, week_start FROM weekly_reviews WHERE deleted_at IS NULL AND (summary LIKE ? OR obstacles_json LIKE ? OR suggestions_json LIKE ?)
     UNION ALL SELECT ai_conversations.id, 'conversation', ai_conversations.title,
       (SELECT content FROM ai_messages WHERE conversation_id = ai_conversations.id AND content LIKE ? ORDER BY created_at DESC LIMIT 1),
       substr(ai_conversations.updated_at, 1, 10)
       FROM ai_conversations WHERE ai_conversations.deleted_at IS NULL AND
       (ai_conversations.title LIKE ? OR EXISTS (
         SELECT 1 FROM ai_messages WHERE conversation_id = ai_conversations.id AND content LIKE ?
       ))
     ORDER BY date DESC LIMIT 500`,
    )
    .all(like, like, like, like, like, like, like, like, like, like, like, like, like)
    .map((row) => searchResultSchema.parse(row))
  return results
    .filter((result) => options.type === undefined || result.type === options.type)
    .filter((result) => options.dateFrom === undefined || (result.date ?? "") >= options.dateFrom)
    .filter((result) => options.dateTo === undefined || (result.date ?? "") <= options.dateTo)
    .slice(0, 100)
}
