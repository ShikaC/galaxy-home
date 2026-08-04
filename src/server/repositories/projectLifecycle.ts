import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { projectIdSchema } from "../../shared/items.js"
import type {
  CompleteProjectStageInput,
  Project,
  UpdateProjectInput,
} from "../../shared/projects.js"
import { getProject } from "./projects.js"

const stageRowSchema = z.object({ id: z.string().uuid(), sort_order: z.number().int() })
const taskRowSchema = z.object({ id: z.string().uuid() }).optional()

function setTask(
  database: DatabaseSync,
  projectId: string,
  stageId: string,
  position: "current" | "next",
  title: string | null | undefined,
  now: string,
): void {
  if (title === undefined) return
  const task = taskRowSchema.parse(
    database
      .prepare(
        "SELECT id FROM project_tasks WHERE project_id = ? AND position = ? ORDER BY created_at LIMIT 1",
      )
      .get(projectId, position),
  )
  if (title === null) {
    if (task !== undefined) database.prepare("DELETE FROM project_tasks WHERE id = ?").run(task.id)
    return
  }
  if (task === undefined) {
    database
      .prepare(
        `INSERT INTO project_tasks
         (id, project_id, stage_id, title, position, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
      )
      .run(crypto.randomUUID(), projectId, stageId, title, position, now, now)
    return
  }
  database
    .prepare("UPDATE project_tasks SET title = ?, source = 'manual', updated_at = ? WHERE id = ?")
    .run(title, now, task.id)
}

export function updateProject(
  database: DatabaseSync,
  rawProjectId: string,
  input: UpdateProjectInput,
): Project {
  const projectId = projectIdSchema.parse(rawProjectId)
  const current = getProject(database, projectId)
  const now = new Date().toISOString()
  const status = input.status ?? current.status
  const progress = input.progress ?? (status === "completed" ? 100 : current.progress)
  const stage = stageRowSchema.parse(
    database
      .prepare(
        "SELECT id, sort_order FROM project_stages WHERE project_id = ? AND status = 'current'",
      )
      .get(projectId),
  )
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `UPDATE projects SET name = ?, desired_outcome = ?, reason = ?, notes = ?,
         deadline_date = ?, status = ?, progress = ?, progress_source = ?, pinned = ?,
         completed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        input.name ?? current.name,
        input.desiredOutcome ?? current.desiredOutcome,
        input.reason === undefined ? current.reason : input.reason,
        input.notes === undefined ? current.notes : input.notes,
        input.deadlineDate === undefined ? current.deadlineDate : input.deadlineDate,
        status,
        progress,
        input.progress === undefined ? current.progressSource : "manual",
        (input.pinned ?? current.pinned) ? 1 : 0,
        status === "completed" ? now : null,
        now,
        projectId,
      )
    if (input.stageTitle !== undefined) {
      database
        .prepare("UPDATE project_stages SET title = ?, updated_at = ? WHERE id = ?")
        .run(input.stageTitle, now, stage.id)
    }
    setTask(database, projectId, stage.id, "current", input.currentTask, now)
    setTask(database, projectId, stage.id, "next", input.nextTask, now)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return getProject(database, projectId)
}

export class ProjectStageNotReadyError extends Error {
  readonly name = "ProjectStageNotReadyError"
}

export function completeProjectStage(
  database: DatabaseSync,
  rawProjectId: string,
  input: CompleteProjectStageInput,
): Project {
  const projectId = projectIdSchema.parse(rawProjectId)
  const project = getProject(database, projectId)
  if (project.currentTask !== null || project.nextTask !== null) {
    throw new ProjectStageNotReadyError("当前阶段仍有未完成任务")
  }
  const stage = stageRowSchema.parse(
    database
      .prepare(
        "SELECT id, sort_order FROM project_stages WHERE project_id = ? AND status = 'current'",
      )
      .get(projectId),
  )
  const now = new Date().toISOString()
  const nextStageId = crypto.randomUUID()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `UPDATE project_stages SET status = 'completed', outcome = ?, completed_at = ?,
         updated_at = ? WHERE id = ?`,
      )
      .run(input.outcome, now, now, stage.id)
    database
      .prepare(
        `INSERT INTO project_stages
         (id, project_id, title, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'current', ?, ?, ?)`,
      )
      .run(nextStageId, projectId, input.stageTitle, stage.sort_order + 1, now, now)
    const insertTask = database.prepare(
      `INSERT INTO project_tasks
       (id, project_id, stage_id, title, position, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
    )
    insertTask.run(
      crypto.randomUUID(),
      projectId,
      nextStageId,
      input.currentTask,
      "current",
      now,
      now,
    )
    insertTask.run(crypto.randomUUID(), projectId, nextStageId, input.nextTask, "next", now, now)
    database
      .prepare(
        `UPDATE projects SET progress = MIN(progress + 15, 95), progress_source = 'manual',
         updated_at = ? WHERE id = ?`,
      )
      .run(now, projectId)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return getProject(database, projectId)
}
