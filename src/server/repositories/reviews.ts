import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type WeeklyReview, weeklyReviewSchema } from "../../shared/app.js"

const reviewRowSchema = z.object({
  id: z.string().uuid(),
  week_start: z.string(),
  summary: z.string(),
  completed_json: z.string(),
  obstacles_json: z.string(),
  suggestions_json: z.string(),
  source: z.enum(["manual", "ai"]),
})

function parseReview(raw: unknown): WeeklyReview {
  const row = reviewRowSchema.parse(raw)
  return weeklyReviewSchema.parse({
    id: row.id,
    weekStart: row.week_start,
    summary: row.summary,
    completed: JSON.parse(row.completed_json),
    obstacles: JSON.parse(row.obstacles_json),
    suggestions: JSON.parse(row.suggestions_json),
    source: row.source,
  })
}

export function listReviews(database: DatabaseSync): readonly WeeklyReview[] {
  return database
    .prepare("SELECT * FROM weekly_reviews WHERE deleted_at IS NULL ORDER BY week_start DESC")
    .all()
    .map(parseReview)
}

export function generateLocalReview(
  database: DatabaseSync,
  weekStart: string,
  weekEnd: string,
): WeeklyReview {
  const completed = database
    .prepare(
      `SELECT title FROM items WHERE status = 'completed' AND is_tutorial = 0
     AND substr(completed_at, 1, 10) BETWEEN ? AND ? ORDER BY completed_at`,
    )
    .all(weekStart, weekEnd)
    .map((row) => z.object({ title: z.string() }).parse(row).title)
  const gains = database
    .prepare(
      "SELECT content FROM daily_gains WHERE deleted_at IS NULL AND local_date BETWEEN ? AND ? ORDER BY local_date",
    )
    .all(weekStart, weekEnd)
    .map((row) => z.object({ content: z.string() }).parse(row).content)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const summary =
    completed.length === 0 && gains.length === 0
      ? "这一周还没有留下完成记录或收获，可以从一个很小的动作重新开始。"
      : `这一周完成了 ${completed.length} 项待办，记录了 ${gains.length} 条收获。`
  const obstacles = completed.length === 0 ? ["本周完成记录较少，可能需要缩小行动范围。"] : []
  const suggestions = [
    { id: crypto.randomUUID(), type: "item", content: "为下周选一个最想推进的小动作" },
  ]
  database
    .prepare(
      `INSERT INTO weekly_reviews
     (id, week_start, summary, completed_json, obstacles_json, suggestions_json, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET summary = excluded.summary, completed_json = excluded.completed_json,
     obstacles_json = excluded.obstacles_json, suggestions_json = excluded.suggestions_json, updated_at = excluded.updated_at`,
    )
    .run(
      id,
      weekStart,
      summary,
      JSON.stringify([...completed, ...gains]),
      JSON.stringify(obstacles),
      JSON.stringify(suggestions),
      now,
      now,
    )
  const row = database.prepare("SELECT * FROM weekly_reviews WHERE week_start = ?").get(weekStart)
  return parseReview(row)
}
