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
  pinned: z.number().int(),
  updated_at: z.string(),
})

const stageRowSchema = z.object({ title: z.string() }).optional()
const countRowSchema = z.object({ value: z.number().int() })
const progressRowSchema = z.object({
  id: z.string().uuid(),
  taskTitle: z.string().nullable(),
  outcome: z.string().nullable(),
  obstacle: z.string().nullable(),
  createdAt: z.string(),
})
const completedStageRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  outcome: z.string().nullable(),
  completedAt: z.string(),
})

function readTask(database: DatabaseSync, projectId: string, position: "current" | "next") {
  const row = database
    .prepare(
      `SELECT id, title, position, source, completed_at AS completedAt FROM project_tasks
       WHERE project_id = ? AND position = ? ORDER BY created_at LIMIT 1`,
    )
    .get(projectId, position)
  return row === undefined ? null : projectTaskSchema.parse(row)
}

function readRecentProgress(database: DatabaseSync, projectId: string) {
  return database
    .prepare(
      `SELECT project_feedback.id, project_tasks.title AS taskTitle,
       project_feedback.outcome, project_feedback.obstacle,
       project_feedback.created_at AS createdAt
       FROM project_feedback
       LEFT JOIN project_tasks ON project_tasks.id = project_feedback.task_id
       WHERE project_feedback.project_id = ?
       ORDER BY project_feedback.created_at DESC LIMIT 8`,
    )
    .all(projectId)
    .map((progress) => progressRowSchema.parse(progress))
}

function readCompletedStages(database: DatabaseSync, projectId: string) {
  return database
    .prepare(
      `SELECT id, title, outcome, completed_at AS completedAt FROM project_stages
       WHERE project_id = ? AND status = 'completed'
       ORDER BY sort_order DESC`,
    )
    .all(projectId)
    .map((rawStage) => {
      const stage = completedStageRowSchema.parse(rawStage)
      const tasks = database
        .prepare(
          `SELECT id, title, position, source, completed_at AS completedAt FROM project_tasks
           WHERE stage_id = ? AND position = 'completed' ORDER BY completed_at, created_at`,
        )
        .all(stage.id)
        .map((task) => projectTaskSchema.parse(task))
      return { ...stage, tasks }
    })
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
    pinned: row.pinned === 1,
    stageTitle: stage?.title ?? "尚未设置阶段",
    currentTask: readTask(database, row.id, "current"),
    nextTask: readTask(database, row.id, "next"),
    completedCount: completed.value,
    recentProgress: readRecentProgress(database, row.id),
    completedStages: readCompletedStages(database, row.id),
    updatedAt: row.updated_at,
  })
}
