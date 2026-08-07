import { z } from "zod"
import { timezoneSchema } from "./settings.js"

const clockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

export const updateSettingsInputSchema = z
  .object({
    workspaceName: z.string().trim().min(1).max(60).optional(),
    aiNickname: z.string().trim().min(1).max(30).optional(),
    userName: z.string().trim().min(1).max(30).optional(),
    timezone: timezoneSchema.optional(),
    aiPermission: z.enum(["conservative", "open"]).optional(),
    aiPersonalityPrompt: z.string().trim().min(1).max(4_000).optional(),
    backupRetentionDays: z.number().int().min(7).max(365).optional(),
    trashRetentionDays: z.number().int().min(1).max(365).optional(),
    morningReminderTime: clockTimeSchema.optional(),
    morningReminderEnabled: z.boolean().optional(),
    eveningReminderTime: clockTimeSchema.optional(),
    eveningReminderEnabled: z.boolean().optional(),
    weeklyReviewTime: clockTimeSchema.optional(),
    weeklyReviewEnabled: z.boolean().optional(),
  })
  .readonly()

export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>

export const gainSchema = z
  .object({
    id: z.string().uuid(),
    localDate: z.iso.date(),
    content: z.string(),
    createdAt: z.string(),
  })
  .readonly()
export type Gain = z.infer<typeof gainSchema>

export const createGainInputSchema = z
  .object({ localDate: z.iso.date(), content: z.string().trim().min(1).max(5_000) })
  .readonly()

export const quoteSchema = z.object({ id: z.string().uuid(), content: z.string() }).readonly()
export type Quote = z.infer<typeof quoteSchema>

export const reviewSuggestionSchema = z
  .object({
    id: z.string(),
    type: z.enum(["item", "habit", "project"]),
    content: z.string(),
    convertedEntityId: z.string().nullable().default(null),
  })
  .readonly()
export type ReviewSuggestion = z.infer<typeof reviewSuggestionSchema>

export const reviewSuggestionConversionSchema = z
  .object({
    reviewId: z.string().uuid(),
    suggestionId: z.string(),
    entityType: z.enum(["item", "habit", "project"]),
    entityId: z.string().uuid(),
    createdAt: z.string(),
  })
  .readonly()

export const weeklyReviewSchema = z
  .object({
    id: z.string().uuid(),
    weekStart: z.iso.date(),
    summary: z.string(),
    completed: z.array(z.string()).readonly(),
    obstacles: z.array(z.string()).readonly(),
    suggestions: z.array(reviewSuggestionSchema).readonly(),
    source: z.enum(["manual", "ai"]),
  })
  .readonly()

export type WeeklyReview = z.infer<typeof weeklyReviewSchema>

export const aiWeeklyReviewResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(5_000),
    obstacles: z.array(z.string().trim().min(1).max(1_000)).max(12),
    suggestions: z
      .array(
        z.object({
          type: z.enum(["item", "habit", "project"]),
          content: z.string().trim().min(1).max(500),
        }),
      )
      .max(8),
  })
  .readonly()

export type AiWeeklyReviewResult = z.infer<typeof aiWeeklyReviewResultSchema>

export const aiConfigInputSchema = z
  .object({
    chatBaseUrl: z.string().url().or(z.literal("")),
    chatModel: z.string().trim().max(100),
    apiKey: z.string().max(500),
    transcriptionBaseUrl: z.string().url().or(z.literal("")),
    transcriptionModel: z.string().trim().max(100),
  })
  .readonly()

export type AiConfigInput = z.infer<typeof aiConfigInputSchema>
