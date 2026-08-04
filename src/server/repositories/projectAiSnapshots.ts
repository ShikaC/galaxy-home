import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { projectIdSchema } from "../../shared/items.js"

const projectRowSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  desired_outcome: z.string(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  deadline_date: z.string().nullable(),
  status: z.string(),
  progress: z.number().int(),
  progress_source: z.string(),
  pinned: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
})
const stageRowSchema = z.object({
  id: z.string().uuid(),
  project_id: projectIdSchema,
  title: z.string(),
  outcome: z.string().nullable(),
  status: z.string(),
  sort_order: z.number().int(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
const taskRowSchema = z.object({
  id: z.string().uuid(),
  project_id: projectIdSchema,
  stage_id: z.string().uuid().nullable(),
  title: z.string(),
  position: z.string(),
  source: z.string(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
const feedbackRowSchema = z.object({
  id: z.string().uuid(),
  project_id: projectIdSchema,
  task_id: z.string().uuid().nullable(),
  outcome: z.string().nullable(),
  obstacle: z.string().nullable(),
  created_at: z.string(),
})
const sessionRowSchema = z.object({
  project_id: projectIdSchema,
  status: z.string(),
  questions_json: z.string(),
  answers_json: z.string(),
  draft_json: z.string().nullable(),
  base_updated_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

const projectSnapshotSchema = z.object({
  project: projectRowSchema,
  stages: z.array(stageRowSchema),
  tasks: z.array(taskRowSchema),
  feedback: z.array(feedbackRowSchema),
  session: sessionRowSchema.nullable(),
})

export const projectUndoPayloadSchema = z.object({
  kind: z.literal("project_snapshot"),
  snapshot: projectSnapshotSchema,
  expected: projectSnapshotSchema.nullable().default(null),
})

export function captureProjectSnapshot(database: DatabaseSync, projectId: string) {
  return projectSnapshotSchema.parse({
    project: database.prepare("SELECT * FROM projects WHERE id = ?").get(projectId),
    stages: database
      .prepare("SELECT * FROM project_stages WHERE project_id = ? ORDER BY sort_order, created_at")
      .all(projectId),
    tasks: database
      .prepare("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY created_at")
      .all(projectId),
    feedback: database
      .prepare("SELECT * FROM project_feedback WHERE project_id = ? ORDER BY created_at")
      .all(projectId),
    session:
      database.prepare("SELECT * FROM project_ai_sessions WHERE project_id = ?").get(projectId) ??
      null,
  })
}

export function recordProjectAiAction(
  database: DatabaseSync,
  actionType: "apply_project_plan" | "advance_project_feedback",
  reason: string,
  projectId: string,
  snapshot: z.infer<typeof projectSnapshotSchema>,
): void {
  const expected = captureProjectSnapshot(database, projectId)
  database
    .prepare(
      `INSERT INTO ai_action_log
       (id, action_type, reason, entity_type, entity_id, undo_payload_json, created_at)
       VALUES (?, ?, ?, 'project', ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      actionType,
      reason,
      projectId,
      JSON.stringify({ kind: "project_snapshot", snapshot, expected }),
      new Date().toISOString(),
    )
}

export function projectMatchesSnapshot(
  database: DatabaseSync,
  snapshot: z.infer<typeof projectSnapshotSchema>,
): boolean {
  return (
    JSON.stringify(captureProjectSnapshot(database, snapshot.project.id)) ===
    JSON.stringify(snapshot)
  )
}

export function restoreProjectSnapshot(
  database: DatabaseSync,
  snapshot: z.infer<typeof projectSnapshotSchema>,
): void {
  const row = snapshot.project
  database
    .prepare(
      `UPDATE projects SET name = ?, desired_outcome = ?, reason = ?, notes = ?, deadline_date = ?,
       status = ?, progress = ?, progress_source = ?, pinned = ?, created_at = ?, updated_at = ?,
       completed_at = ?, deleted_at = ? WHERE id = ?`,
    )
    .run(
      row.name,
      row.desired_outcome,
      row.reason,
      row.notes,
      row.deadline_date,
      row.status,
      row.progress,
      row.progress_source,
      row.pinned,
      row.created_at,
      row.updated_at,
      row.completed_at,
      row.deleted_at,
      row.id,
    )
  database.prepare("DELETE FROM project_feedback WHERE project_id = ?").run(row.id)
  database.prepare("DELETE FROM project_tasks WHERE project_id = ?").run(row.id)
  database.prepare("DELETE FROM project_stages WHERE project_id = ?").run(row.id)
  const insertStage = database.prepare(
    `INSERT INTO project_stages
     (id, project_id, title, outcome, status, sort_order, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const stage of snapshot.stages)
    insertStage.run(
      stage.id,
      stage.project_id,
      stage.title,
      stage.outcome,
      stage.status,
      stage.sort_order,
      stage.completed_at,
      stage.created_at,
      stage.updated_at,
    )
  const insertTask = database.prepare(
    `INSERT INTO project_tasks
     (id, project_id, stage_id, title, position, source, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const task of snapshot.tasks)
    insertTask.run(
      task.id,
      task.project_id,
      task.stage_id,
      task.title,
      task.position,
      task.source,
      task.completed_at,
      task.created_at,
      task.updated_at,
    )
  const insertFeedback = database.prepare(
    `INSERT INTO project_feedback (id, project_id, task_id, outcome, obstacle, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const feedback of snapshot.feedback)
    insertFeedback.run(
      feedback.id,
      feedback.project_id,
      feedback.task_id,
      feedback.outcome,
      feedback.obstacle,
      feedback.created_at,
    )
  database.prepare("DELETE FROM project_ai_sessions WHERE project_id = ?").run(row.id)
  if (snapshot.session !== null) {
    const session = snapshot.session
    database
      .prepare(
        `INSERT INTO project_ai_sessions
         (project_id, status, questions_json, answers_json, draft_json, base_updated_at,
          created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.project_id,
        session.status,
        session.questions_json,
        session.answers_json,
        session.draft_json,
        session.base_updated_at,
        session.created_at,
        session.updated_at,
      )
  }
}
