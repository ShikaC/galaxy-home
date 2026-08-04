import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { projectIdSchema } from "../../shared/items.js"
import type { AdvanceProjectInput, CreateProjectInput, Project } from "../../shared/projects.js"
import { readProject } from "./projectRows.js"

export class ProjectNotFoundError extends Error {
  readonly name = "ProjectNotFoundError"
}

export function getProject(database: DatabaseSync, rawProjectId: string): Project {
  const projectId = projectIdSchema.parse(rawProjectId)
  const row = database
    .prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL")
    .get(projectId)
  if (row === undefined) throw new ProjectNotFoundError(`Project not found: ${projectId}`)
  return readProject(database, row)
}

export function listProjects(database: DatabaseSync): readonly Project[] {
  return database
    .prepare(
      "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC",
    )
    .all()
    .map((row) => readProject(database, row))
}

export function createProject(database: DatabaseSync, input: CreateProjectInput): Project {
  const projectId = projectIdSchema.parse(crypto.randomUUID())
  const stageId = crypto.randomUUID()
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `INSERT INTO projects
         (id, name, desired_outcome, reason, notes, deadline_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        input.name,
        input.desiredOutcome,
        input.reason,
        input.notes,
        input.deadlineDate,
        now,
        now,
      )
    database
      .prepare(
        `INSERT INTO project_stages
         (id, project_id, title, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'current', 0, ?, ?)`,
      )
      .run(stageId, projectId, input.stageTitle, now, now)
    const task = database.prepare(
      `INSERT INTO project_tasks
       (id, project_id, stage_id, title, position, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
    )
    task.run(crypto.randomUUID(), projectId, stageId, input.currentTask, "current", now, now)
    task.run(crypto.randomUUID(), projectId, stageId, input.nextTask, "next", now, now)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return getProject(database, projectId)
}

export function advanceProject(
  database: DatabaseSync,
  rawProjectId: string,
  input: AdvanceProjectInput,
): void {
  const project = getProject(database, rawProjectId)
  if (project.currentTask === null) return
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        "UPDATE project_tasks SET position = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(now, now, project.currentTask.id)
    database
      .prepare(
        "UPDATE project_tasks SET position = 'current', updated_at = ? WHERE project_id = ? AND position = 'next'",
      )
      .run(now, project.id)
    database
      .prepare(
        "INSERT INTO project_feedback (id, project_id, task_id, outcome, obstacle, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        crypto.randomUUID(),
        project.id,
        project.currentTask.id,
        input.outcome,
        input.obstacle,
        now,
      )
    if (input.nextTask !== null) {
      const stage = z
        .object({ id: z.string() })
        .parse(
          database
            .prepare("SELECT id FROM project_stages WHERE project_id = ? AND status = 'current'")
            .get(project.id),
        )
      database
        .prepare(
          `INSERT INTO project_tasks
         (id, project_id, stage_id, title, position, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'next', 'manual', ?, ?)`,
        )
        .run(crypto.randomUUID(), project.id, stage.id, input.nextTask, now, now)
    }
    database
      .prepare("UPDATE projects SET progress = MIN(progress + 10, 95), updated_at = ? WHERE id = ?")
      .run(now, project.id)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
