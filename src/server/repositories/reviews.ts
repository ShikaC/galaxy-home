import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type WeeklyReview, weeklyReviewSchema } from "../../shared/app.js"
import { localDateTimeToInstant, shiftCalendarDate } from "../services/time.js"

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
  timezone = "Asia/Shanghai",
): WeeklyReview {
  const periodStart = localDateTimeToInstant(weekStart, "00:00", timezone).toISOString()
  const periodEnd = localDateTimeToInstant(
    shiftCalendarDate(weekEnd, 1),
    "00:00",
    timezone,
  ).toISOString()
  const completed = database
    .prepare(
      `SELECT title FROM items WHERE status = 'completed' AND is_tutorial = 0
     AND completed_at >= ? AND completed_at < ? ORDER BY completed_at`,
    )
    .all(periodStart, periodEnd)
    .map((row) => z.object({ title: z.string() }).parse(row).title)
  const gains = database
    .prepare(
      "SELECT content FROM daily_gains WHERE deleted_at IS NULL AND local_date BETWEEN ? AND ? ORDER BY local_date",
    )
    .all(weekStart, weekEnd)
    .map((row) => z.object({ content: z.string() }).parse(row).content)
  const habits = database
    .prepare(
      `SELECT habits.name, COUNT(*) AS completed_days
       FROM habit_logs JOIN habits ON habits.id = habit_logs.habit_id
       WHERE habit_logs.local_date BETWEEN ? AND ? AND habit_logs.status = 'active'
         AND habit_logs.count >= habits.target_count AND habits.deleted_at IS NULL
       GROUP BY habits.id, habits.name ORDER BY completed_days DESC`,
    )
    .all(weekStart, weekEnd)
    .map((row) => z.object({ name: z.string(), completed_days: z.number() }).parse(row))
  const projects = database
    .prepare(
      `SELECT name, progress, status FROM projects
       WHERE deleted_at IS NULL AND updated_at >= ? AND updated_at < ? ORDER BY updated_at DESC`,
    )
    .all(periodStart, periodEnd)
    .map((row) =>
      z.object({ name: z.string(), progress: z.number(), status: z.string() }).parse(row),
    )
  const feedback = database
    .prepare(
      `SELECT project_feedback.obstacle FROM project_feedback
       WHERE project_feedback.obstacle IS NOT NULL AND project_feedback.obstacle != ''
         AND project_feedback.created_at >= ? AND project_feedback.created_at < ?
       ORDER BY project_feedback.created_at`,
    )
    .all(periodStart, periodEnd)
    .map((row) => z.object({ obstacle: z.string() }).parse(row).obstacle)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const summary =
    completed.length === 0 && gains.length === 0 && habits.length === 0 && projects.length === 0
      ? "这一周还没有留下完成记录，可以从一个很小的动作重新开始。"
      : `这一周完成了 ${completed.length} 项待办，${habits.length} 个习惯留下完成记录，推进了 ${projects.length} 个项目，并记录了 ${gains.length} 条收获。`
  const obstacles =
    feedback.length > 0
      ? feedback
      : completed.length === 0
        ? ["本周完成记录较少，可能需要缩小行动范围。"]
        : []
  const suggestions = [
    { id: crypto.randomUUID(), type: "item" as const, content: "为下周选一个最想推进的小动作" },
    ...(habits.length === 0
      ? [
          {
            id: crypto.randomUUID(),
            type: "habit" as const,
            content: "选择一个容易坚持的日常动作",
          },
        ]
      : []),
    ...(feedback.length > 0
      ? [
          {
            id: crypto.randomUUID(),
            type: "project" as const,
            content: "为受阻项目明确一个可验证的下一步",
          },
        ]
      : []),
  ]
  const completedEntries = [
    ...completed,
    ...gains,
    ...habits.map((habit) => `习惯「${habit.name}」完成 ${habit.completed_days} 天`),
    ...projects.map((project) =>
      project.status === "completed"
        ? `项目「${project.name}」已完成`
        : `项目「${project.name}」推进至 ${project.progress}%`,
    ),
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
      JSON.stringify(completedEntries),
      JSON.stringify(obstacles),
      JSON.stringify(suggestions),
      now,
      now,
    )
  const row = database.prepare("SELECT * FROM weekly_reviews WHERE week_start = ?").get(weekStart)
  return parseReview(row)
}
