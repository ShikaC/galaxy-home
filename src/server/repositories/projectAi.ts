import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { projectIdSchema } from "../../shared/items.js"
import {
  type ProjectAiFeedbackResult,
  type ProjectAiPlan,
  type ProjectAiSession,
  projectAiPlanSchema,
  projectAiSessionSchema,
} from "../../shared/projects.js"
import { completeProjectStage } from "./projectLifecycle.js"
import { advanceProject, getProject } from "./projects.js"

const statusSchema = z.enum(["clarifying", "ready", "applied"])
const sessionRowSchema = z.object({
  project_id: projectIdSchema,
  status: statusSchema,
  questions_json: z.string(),
  answers_json: z.string(),
  draft_json: z.string().nullable(),
  base_updated_at: z.string(),
})

export type ProjectAiSessionData = {
  readonly projectId: string
  readonly status: z.infer<typeof statusSchema>
  readonly questions: readonly string[]
  readonly answers: readonly string[]
  readonly draft: ProjectAiPlan | null
  readonly baseUpdatedAt: string
}

export class ProjectAiSessionNotFoundError extends Error {
  readonly name = "ProjectAiSessionNotFoundError"
}

export class ProjectAiPlanStaleError extends Error {
  readonly name = "ProjectAiPlanStaleError"
}

export function getProjectAiSessionData(
  database: DatabaseSync,
  rawProjectId: string,
): ProjectAiSessionData {
  const projectId = projectIdSchema.parse(rawProjectId)
  const raw = database
    .prepare("SELECT * FROM project_ai_sessions WHERE project_id = ?")
    .get(projectId)
  if (raw === undefined) throw new ProjectAiSessionNotFoundError("还没有 AI 澄清会话")
  const row = sessionRowSchema.parse(raw)
  return {
    projectId: row.project_id,
    status: row.status,
    questions: z.array(z.string()).min(1).max(3).parse(JSON.parse(row.questions_json)),
    answers: z.array(z.string()).max(3).parse(JSON.parse(row.answers_json)),
    draft: row.draft_json === null ? null : projectAiPlanSchema.parse(JSON.parse(row.draft_json)),
    baseUpdatedAt: row.base_updated_at,
  }
}

function toPublicSession(session: ProjectAiSessionData): ProjectAiSession {
  return projectAiSessionSchema.parse({
    projectId: session.projectId,
    status: session.status,
    currentQuestion: session.questions[session.answers.length] ?? null,
    answeredCount: session.answers.length,
    totalQuestions: session.questions.length,
    draft: session.draft,
  })
}

export function getProjectAiSession(
  database: DatabaseSync,
  rawProjectId: string,
): ProjectAiSession | null {
  const projectId = projectIdSchema.parse(rawProjectId)
  const exists = database
    .prepare("SELECT project_id FROM project_ai_sessions WHERE project_id = ?")
    .get(projectId)
  return exists === undefined ? null : toPublicSession(getProjectAiSessionData(database, projectId))
}

export function startProjectAiSession(
  database: DatabaseSync,
  rawProjectId: string,
  questions: readonly string[],
): ProjectAiSession {
  const project = getProject(database, rawProjectId)
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO project_ai_sessions
       (project_id, status, questions_json, answers_json, draft_json,
        base_updated_at, created_at, updated_at)
       VALUES (?, 'clarifying', ?, '[]', NULL, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET status = 'clarifying',
       questions_json = excluded.questions_json, answers_json = '[]', draft_json = NULL,
       base_updated_at = excluded.base_updated_at, updated_at = excluded.updated_at`,
    )
    .run(project.id, JSON.stringify(questions), project.updatedAt, now, now)
  return toPublicSession(getProjectAiSessionData(database, project.id))
}

export function appendProjectAiAnswer(
  database: DatabaseSync,
  rawProjectId: string,
  answer: string,
  draft: ProjectAiPlan | null,
  baseUpdatedAt: string,
): ProjectAiSession {
  const session = getProjectAiSessionData(database, rawProjectId)
  if (session.answers.length >= session.questions.length) {
    throw new ProjectAiPlanStaleError("当前问题已经回答完成")
  }
  const answers = [...session.answers, answer]
  const now = new Date().toISOString()
  database
    .prepare(
      `UPDATE project_ai_sessions SET answers_json = ?, draft_json = ?, status = ?,
       base_updated_at = ?, updated_at = ? WHERE project_id = ?`,
    )
    .run(
      JSON.stringify(answers),
      draft === null ? null : JSON.stringify(draft),
      draft === null ? "clarifying" : "ready",
      baseUpdatedAt,
      now,
      session.projectId,
    )
  return toPublicSession(getProjectAiSessionData(database, session.projectId))
}

function setAiTask(
  database: DatabaseSync,
  projectId: string,
  stageId: string,
  position: "current" | "next",
  title: string,
  now: string,
): void {
  const existing = database
    .prepare("SELECT id FROM project_tasks WHERE project_id = ? AND position = ?")
    .get(projectId, position)
  if (existing !== undefined) {
    database
      .prepare(
        "UPDATE project_tasks SET title = ?, source = 'ai', stage_id = ?, updated_at = ? WHERE project_id = ? AND position = ?",
      )
      .run(title, stageId, now, projectId, position)
    return
  }
  database
    .prepare(
      `INSERT INTO project_tasks
       (id, project_id, stage_id, title, position, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ai', ?, ?)`,
    )
    .run(crypto.randomUUID(), projectId, stageId, title, position, now, now)
}

export function applyProjectAiPlan(database: DatabaseSync, rawProjectId: string) {
  const session = getProjectAiSessionData(database, rawProjectId)
  if (session.draft === null || session.status !== "ready") {
    throw new ProjectAiPlanStaleError("没有可采用的 AI 拆解")
  }
  const project = getProject(database, session.projectId)
  if (project.updatedAt !== session.baseUpdatedAt) {
    throw new ProjectAiPlanStaleError("项目现状已更新，请重新澄清后再采用")
  }
  const stage = z
    .object({ id: z.string().uuid() })
    .parse(
      database
        .prepare("SELECT id FROM project_stages WHERE project_id = ? AND status = 'current'")
        .get(project.id),
    )
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare("UPDATE project_stages SET title = ?, updated_at = ? WHERE id = ?")
      .run(session.draft.stageTitle, now, stage.id)
    setAiTask(database, project.id, stage.id, "current", session.draft.currentTask, now)
    setAiTask(database, project.id, stage.id, "next", session.draft.nextTask, now)
    database
      .prepare(
        "UPDATE projects SET progress = ?, progress_source = 'ai', updated_at = ? WHERE id = ?",
      )
      .run(session.draft.progress, now, project.id)
    database
      .prepare(
        "UPDATE project_ai_sessions SET status = 'applied', updated_at = ? WHERE project_id = ?",
      )
      .run(now, project.id)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return getProject(database, project.id)
}

export function applyProjectAiFeedback(
  database: DatabaseSync,
  rawProjectId: string,
  expectedTaskId: string,
  outcome: string | null,
  obstacle: string | null,
  result: ProjectAiFeedbackResult,
) {
  const project = getProject(database, rawProjectId)
  if (project.currentTask?.id !== expectedTaskId) {
    throw new ProjectAiPlanStaleError("当前任务已变化，未应用过期的 AI 建议")
  }
  if (result.kind === "stage" && project.nextTask !== null) {
    throw new ProjectAiPlanStaleError("当前阶段还有下一任务")
  }
  advanceProject(database, project.id, {
    outcome,
    obstacle,
    nextTask: result.kind === "task" ? result.nextTask : null,
  })
  if (result.kind === "stage") {
    completeProjectStage(database, project.id, {
      outcome: result.stageOutcome,
      stageTitle: result.stageTitle,
      currentTask: result.currentTask,
      nextTask: result.nextTask,
    })
  }
  const now = new Date().toISOString()
  database
    .prepare(
      `UPDATE project_tasks SET source = 'ai', updated_at = ?
       WHERE project_id = ? AND position IN ('current', 'next')`,
    )
    .run(now, project.id)
  database
    .prepare(
      "UPDATE projects SET progress = ?, progress_source = 'ai', updated_at = ? WHERE id = ?",
    )
    .run(result.progress, now, project.id)
  return getProject(database, project.id)
}
