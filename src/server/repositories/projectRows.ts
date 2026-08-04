import type { DatabaseSync, SQLOutputValue } from "node:sqlite"
import { z } from "zod"
import { projectIdSchema } from "../../shared/items.js"
import {
  type Project,
  projectSchema,
  projectStatusSchema,
  projectTaskSchema,
} from "../../shared/projects.js"

const projectRowSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  desired_outcome: z.string(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  deadline_date: z.string().nullable(),
  status: projectStatusSchema,
  progress: z.number().int(),
  progress_source: z.enum(["manual", "ai"]),
  updated_at: z.string(),
})

const stageRowSchema = z.object({ title: z.string() }).optional()
const countRowSchema = z.object({ value: z.number().int() })

function readTask(database: DatabaseSync, projectId: string, position: "current" | "next") {
  const row = database
    .prepare(
      `SELECT id, title, position, source FROM project_tasks
       WHERE project_id = ? AND position = ? ORDER BY created_at LIMIT 1`,
    )
    .get(projectId, position)
  return row === undefined ? null : projectTaskSchema.parse(row)
}

export function readProject(
  database: DatabaseSync,
  rawRow: Record<string, SQLOutputValue>,
): Project {
  const row = projectRowSchema.parse(rawRow)
  const stage = stageRowSchema.parse(
    database
      .prepare(
        "SELECT title FROM project_stages WHERE project_id = ? AND status = 'current' ORDER BY sort_order LIMIT 1",
      )
      .get(row.id),
  )
  const completed = countRowSchema.parse(
    database
      .prepare(
        "SELECT COUNT(*) AS value FROM project_tasks WHERE project_id = ? AND position = 'completed'",
      )
      .get(row.id),
  )
  return projectSchema.parse({
    id: row.id,
    name: row.name,
    desiredOutcome: row.desired_outcome,
    reason: row.reason,
    notes: row.notes,
    deadlineDate: row.deadline_date,
    status: row.status,
    progress: row.progress,
    progressSource: row.progress_source,
    stageTitle: stage?.title ?? "尚未设置阶段",
    currentTask: readTask(database, row.id, "current"),
    nextTask: readTask(database, row.id, "next"),
    completedCount: completed.value,
    updatedAt: row.updated_at,
  })
}
