import { z } from "zod"
import { projectIdSchema } from "./items.js"

export const projectStatusSchema = z.enum(["active", "paused", "completed", "archived"])
export const projectTaskPositionSchema = z.enum(["current", "next", "completed"])

export const createProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    desiredOutcome: z.string().trim().min(1).max(1_000),
    reason: z.string().trim().max(2_000).nullable().default(null),
    notes: z.string().trim().max(10_000).nullable().default(null),
    deadlineDate: z.iso.date().nullable().default(null),
    stageTitle: z.string().trim().min(1).max(160).default("迈出第一步"),
    currentTask: z.string().trim().min(1).max(240).nullable().default(null),
    nextTask: z.string().trim().min(1).max(240).nullable().default(null),
  })
  .readonly()

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

export const projectTaskSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    position: projectTaskPositionSchema,
    source: z.enum(["manual", "ai"]),
    completedAt: z.string().nullable(),
  })
  .readonly()

export const projectProgressSchema = z
  .object({
    id: z.string().uuid(),
    taskTitle: z.string().nullable(),
    outcome: z.string().nullable(),
    obstacle: z.string().nullable(),
    createdAt: z.string(),
  })
  .readonly()

export const projectStageSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    outcome: z.string().nullable(),
    completedAt: z.string(),
    tasks: z.array(projectTaskSchema).readonly(),
  })
  .readonly()

export const projectSchema = z
  .object({
    id: projectIdSchema,
    name: z.string(),
    desiredOutcome: z.string(),
    reason: z.string().nullable(),
    notes: z.string().nullable(),
    deadlineDate: z.string().nullable(),
    status: projectStatusSchema,
    progress: z.number().int().min(0).max(100),
    progressSource: z.enum(["manual", "ai"]),
    pinned: z.boolean(),
    stageTitle: z.string(),
    currentTask: projectTaskSchema.nullable(),
    nextTask: projectTaskSchema.nullable(),
    completedCount: z.number().int().nonnegative(),
    recentProgress: z.array(projectProgressSchema).readonly(),
    completedStages: z.array(projectStageSchema).readonly(),
    updatedAt: z.string(),
  })
  .readonly()

export type Project = z.infer<typeof projectSchema>

export const advanceProjectInputSchema = z
  .object({
    outcome: z.string().trim().max(2_000).nullable(),
    obstacle: z.string().trim().max(2_000).nullable(),
    nextTask: z.string().trim().min(1).max(240).nullable(),
  })
  .readonly()

export type AdvanceProjectInput = z.infer<typeof advanceProjectInputSchema>

export const updateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    desiredOutcome: z.string().trim().min(1).max(1_000).optional(),
    reason: z.string().trim().max(2_000).nullable().optional(),
    notes: z.string().trim().max(10_000).nullable().optional(),
    deadlineDate: z.iso.date().nullable().optional(),
    status: projectStatusSchema.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    pinned: z.boolean().optional(),
    stageTitle: z.string().trim().min(1).max(160).optional(),
    currentTask: z.string().trim().min(1).max(240).nullable().optional(),
    nextTask: z.string().trim().min(1).max(240).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "至少需要修改一项")
  .readonly()

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

export const completeProjectStageInputSchema = z
  .object({
    outcome: z.string().trim().min(1).max(2_000),
    stageTitle: z.string().trim().min(1).max(160),
    currentTask: z.string().trim().min(1).max(240),
    nextTask: z.string().trim().min(1).max(240),
  })
  .readonly()

export type CompleteProjectStageInput = z.infer<typeof completeProjectStageInputSchema>

export const projectAiPlanSchema = z
  .object({
    stageTitle: z.string().trim().min(1).max(160),
    currentTask: z.string().trim().min(1).max(240),
    nextTask: z.string().trim().min(1).max(240),
    progress: z.number().int().min(0).max(95),
  })
  .readonly()

export type ProjectAiPlan = z.infer<typeof projectAiPlanSchema>

export const projectAiHistoryEntrySchema = z
  .object({
    question: z.string(),
    answer: z.string(),
  })
  .readonly()

export const projectAiSessionSchema = z
  .object({
    projectId: projectIdSchema,
    status: z.enum(["clarifying", "ready", "applied"]),
    currentQuestion: z.string().nullable(),
    answeredCount: z.number().int().nonnegative(),
    totalQuestions: z.number().int().min(1).max(3),
    draft: projectAiPlanSchema.nullable(),
    history: z.array(projectAiHistoryEntrySchema).readonly().default([]),
  })
  .readonly()

export type ProjectAiSession = z.infer<typeof projectAiSessionSchema>

export const projectAiStartInputSchema = z
  .object({ mode: z.enum(["create", "resume"]).default("create") })
  .readonly()

export const projectAiAnswerInputSchema = z
  .object({ answer: z.string().trim().min(1).max(2_000) })
  .readonly()

export const projectAiQuestionsSchema = z
  .object({ questions: z.array(z.string().trim().min(1).max(300)).min(1).max(3) })
  .readonly()

const projectAiTaskFeedbackSchema = z
  .object({
    kind: z.literal("task"),
    nextTask: z.string().trim().min(1).max(240).nullable(),
    progress: z.number().int().min(0).max(95),
  })
  .readonly()

const projectAiStageFeedbackSchema = z
  .object({
    kind: z.literal("stage"),
    stageOutcome: z.string().trim().min(1).max(2_000),
    stageTitle: z.string().trim().min(1).max(160),
    currentTask: z.string().trim().min(1).max(240),
    nextTask: z.string().trim().min(1).max(240),
    progress: z.number().int().min(0).max(95),
  })
  .readonly()

export const projectAiFeedbackResultSchema = z.discriminatedUnion("kind", [
  projectAiTaskFeedbackSchema,
  projectAiStageFeedbackSchema,
])

export type ProjectAiFeedbackResult = z.infer<typeof projectAiFeedbackResultSchema>

export const projectAiFeedbackInputSchema = z
  .object({
    outcome: z.string().trim().max(2_000).nullable(),
    obstacle: z.string().trim().max(2_000).nullable(),
  })
  .readonly()
