import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { aiWeeklyReviewResultSchema } from "../../shared/app.js"
import { getReviewSnapshot, recordReviewAction } from "../repositories/aiActions.js"
import { saveAiReview } from "../repositories/reviews.js"
import { getSettings } from "../repositories/settings.js"
import { chatStructured } from "./ai.js"
import { localDateTimeToInstant, shiftCalendarDate } from "./time.js"

const textRowSchema = z.object({ text: z.string() })
const habitRowSchema = z.object({ name: z.string(), completedDays: z.number() })
const projectRowSchema = z.object({ name: z.string(), progress: z.number(), status: z.string() })

export class AiConfirmationRequiredError extends Error {
  readonly name = "AiConfirmationRequiredError"
}

function collectReviewContext(
  database: DatabaseSync,
  weekStart: string,
  weekEnd: string,
  timezone: string,
) {
  const periodStart = localDateTimeToInstant(weekStart, "00:00", timezone).toISOString()
  const periodEnd = localDateTimeToInstant(
    shiftCalendarDate(weekEnd, 1),
    "00:00",
    timezone,
  ).toISOString()
  const completedItems = database
    .prepare(
      `SELECT title AS text FROM items WHERE status = 'completed' AND is_tutorial = 0
       AND completed_at >= ? AND completed_at < ? ORDER BY completed_at`,
    )
    .all(periodStart, periodEnd)
    .map((row) => textRowSchema.parse(row).text)
  const gains = database
    .prepare(
      `SELECT content AS text FROM daily_gains WHERE deleted_at IS NULL
       AND local_date BETWEEN ? AND ? ORDER BY local_date`,
    )
    .all(weekStart, weekEnd)
    .map((row) => textRowSchema.parse(row).text)
  const habits = database
    .prepare(
      `SELECT habits.name, COUNT(*) AS completedDays
       FROM habit_logs JOIN habits ON habits.id = habit_logs.habit_id
       WHERE habit_logs.local_date BETWEEN ? AND ? AND habit_logs.status = 'active'
         AND habit_logs.count >= habits.target_count AND habits.deleted_at IS NULL
         AND habits.is_tutorial = 0
       GROUP BY habits.id, habits.name ORDER BY completedDays DESC`,
    )
    .all(weekStart, weekEnd)
    .map((row) => habitRowSchema.parse(row))
  const projects = database
    .prepare(
      `SELECT name, progress, status FROM projects WHERE deleted_at IS NULL
       AND updated_at >= ? AND updated_at < ? ORDER BY updated_at DESC`,
    )
    .all(periodStart, periodEnd)
    .map((row) => projectRowSchema.parse(row))
  const obstacles = database
    .prepare(
      `SELECT obstacle AS text FROM project_feedback
       WHERE obstacle IS NOT NULL AND obstacle != '' AND created_at >= ? AND created_at < ?
       ORDER BY created_at`,
    )
    .all(periodStart, periodEnd)
    .map((row) => textRowSchema.parse(row).text)
  const completed = [
    ...completedItems,
    ...gains,
    ...habits.map((habit) => `习惯「${habit.name}」完成 ${habit.completedDays} 天`),
    ...projects.map((project) =>
      project.status === "completed"
        ? `项目「${project.name}」已完成`
        : `项目「${project.name}」推进至 ${project.progress}%`,
    ),
  ]
  return { completed, completedItems, gains, habits, projects, obstacles }
}

export async function generateAiWeeklyReview(
  database: DatabaseSync,
  secretPath: string,
  weekStart: string,
  weekEnd: string,
  confirmed: boolean,
) {
  const settings = getSettings(database)
  if (settings.aiPermission === "conservative" && !confirmed)
    throw new AiConfirmationRequiredError("保守模式下需要先确认生成 AI 周回顾")
  const context = collectReviewContext(database, weekStart, weekEnd, settings.timezone)
  const result = await chatStructured(
    secretPath,
    [
      {
        role: "system",
        content:
          "你是温和务实的周回顾助手。只返回 JSON，字段为 summary、obstacles、suggestions。suggestions 每项包含 type(item、habit 或 project) 与 content。基于事实总结，不批评、不制造内疚，建议必须具体且可确认后转换。",
      },
      { role: "user", content: JSON.stringify({ weekStart, weekEnd, ...context }) },
    ],
    aiWeeklyReviewResultSchema,
  )
  database.exec("BEGIN IMMEDIATE")
  try {
    const previous = getReviewSnapshot(database, weekStart)
    const review = saveAiReview(database, weekStart, context.completed, result)
    recordReviewAction(database, review.id, previous)
    database.exec("COMMIT")
    return review
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
