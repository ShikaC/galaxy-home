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
    currentTask: z.string().trim().min(1).max(240),
    nextTask: z.string().trim().min(1).max(240),
  })
  .readonly()

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

export const projectTaskSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    position: projectTaskPositionSchema,
    source: z.enum(["manual", "ai"]),
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
    stageTitle: z.string(),
    currentTask: projectTaskSchema.nullable(),
    nextTask: projectTaskSchema.nullable(),
    completedCount: z.number().int().nonnegative(),
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
