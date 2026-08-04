import type { DatabaseSync } from "node:sqlite"
import {
  type ProjectAiFeedbackResult,
  projectAiFeedbackResultSchema,
  projectAiPlanSchema,
  projectAiQuestionsSchema,
} from "../../shared/projects.js"
import {
  appendProjectAiAnswer,
  applyProjectAiFeedback,
  getProjectAiSessionData,
  startProjectAiSession,
} from "../repositories/projectAi.js"
import { getProject } from "../repositories/projects.js"
import { chatStructured } from "./ai.js"

function projectContext(database: DatabaseSync, projectId: string) {
  const project = getProject(database, projectId)
  return {
    name: project.name,
    desiredOutcome: project.desiredOutcome,
    reason: project.reason,
    notes: project.notes,
    deadlineDate: project.deadlineDate,
    stageTitle: project.stageTitle,
    currentTask: project.currentTask?.title ?? null,
    nextTask: project.nextTask?.title ?? null,
    progress: project.progress,
    status: project.status,
  }
}

export async function startProjectAiClarification(
  database: DatabaseSync,
  secretPath: string,
  projectId: string,
) {
  const result = await chatStructured(
    secretPath,
    [
      {
        role: "system",
        content:
          "你是温和务实的项目教练。只返回 JSON，格式为 {questions:string[]}。生成 1 到 3 个简短问题，用于澄清成功标准和当前情况，不要一次规划完整任务链。",
      },
      { role: "user", content: JSON.stringify(projectContext(database, projectId)) },
    ],
    projectAiQuestionsSchema,
  )
  return startProjectAiSession(database, projectId, result.questions)
}

export async function answerProjectAiClarification(
  database: DatabaseSync,
  secretPath: string,
  projectId: string,
  answer: string,
) {
  const session = getProjectAiSessionData(database, projectId)
  const answers = [...session.answers, answer]
  const project = getProject(database, projectId)
  if (answers.length < session.questions.length) {
    return appendProjectAiAnswer(database, projectId, answer, null, project.updatedAt)
  }
  const qa = session.questions.map((question, index) => ({
    question,
    answer: answers[index] ?? "",
  }))
  const draft = await chatStructured(
    secretPath,
    [
      {
        role: "system",
        content:
          "你是温和务实的项目教练。只返回 JSON，字段为 stageTitle、currentTask、nextTask、progress。只规划当前阶段、可立即开始的当前任务和紧接着的下一任务。progress 是 0 到 95 的保守估算整数。",
      },
      {
        role: "user",
        content: JSON.stringify({
          project: projectContext(database, projectId),
          clarification: qa,
        }),
      },
    ],
    projectAiPlanSchema,
  )
  return appendProjectAiAnswer(database, projectId, answer, draft, project.updatedAt)
}

export async function advanceProjectFromAiFeedback(
  database: DatabaseSync,
  secretPath: string,
  projectId: string,
  outcome: string | null,
  obstacle: string | null,
) {
  const project = getProject(database, projectId)
  if (project.currentTask === null) throw new Error("当前没有可完成的任务")
  const currentTaskId = project.currentTask.id
  const result: ProjectAiFeedbackResult = await chatStructured(
    secretPath,
    [
      {
        role: "system",
        content:
          "你是温和务实的项目教练。只返回 JSON。通常返回 {kind:'task',nextTask:string|null,progress:number}；只有输入明确说明当前没有下一任务且阶段目标已完成时，才返回 {kind:'stage',stageOutcome,stageTitle,currentTask,nextTask,progress}。不生成完整任务链。",
      },
      {
        role: "user",
        content: JSON.stringify({
          project: projectContext(database, projectId),
          feedback: { outcome, obstacle },
        }),
      },
    ],
    projectAiFeedbackResultSchema,
  )
  return applyProjectAiFeedback(database, projectId, currentTaskId, outcome, obstacle, result)
}
