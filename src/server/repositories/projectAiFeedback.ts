import type { DatabaseSync } from "node:sqlite"
import type { ProjectAiFeedbackResult } from "../../shared/projects.js"
import { ProjectAiPlanStaleError } from "./projectAiErrors.js"
import { captureProjectSnapshot, recordProjectAiAction } from "./projectAiSnapshots.js"
import { completeProjectStageRows } from "./projectLifecycle.js"
import { advanceProjectRows, getProject } from "./projects.js"

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
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    const snapshot = captureProjectSnapshot(database, project.id)
    advanceProjectRows(
      database,
      project,
      {
        outcome,
        obstacle,
        nextTask: result.kind === "task" ? result.nextTask : null,
      },
      now,
    )
    if (result.kind === "stage") {
      completeProjectStageRows(
        database,
        project.id,
        {
          outcome: result.stageOutcome,
          stageTitle: result.stageTitle,
          currentTask: result.currentTask,
          nextTask: result.nextTask,
        },
        now,
      )
    }
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
    recordProjectAiAction(
      database,
      "advance_project_feedback",
      "根据完成反馈更新 AI 项目估算与下一步",
      project.id,
      snapshot,
    )
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return getProject(database, project.id)
}
