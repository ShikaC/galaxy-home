import { z } from "zod"
import {
  aiChatResponseSchema,
  aiMemorySchema,
  aiMessageSchema,
  aiMessagesSchema,
} from "../../shared/ai.js"
import { gainSchema, quoteSchema, weeklyReviewSchema } from "../../shared/app.js"
import { habitSchema } from "../../shared/habits.js"
import { categorySchema, itemSchema } from "../../shared/items.js"
import { projectAiSessionSchema, projectSchema } from "../../shared/projects.js"
import { notificationsSchema } from "../../shared/reminders.js"
import { workspaceSettingsSchema } from "../../shared/settings.js"

export const itemsSchema = z.array(itemSchema).readonly()
export const habitsSchema = z.array(habitSchema).readonly()
export const projectsSchema = z.array(projectSchema).readonly()
export const gainsSchema = z.array(gainSchema).readonly()
export const reviewsSchema = z.array(weeklyReviewSchema).readonly()
export {
  gainSchema,
  habitSchema,
  itemSchema,
  notificationsSchema,
  projectAiSessionSchema,
  projectSchema,
  quoteSchema,
}

export const aiStatusSchema = z.object({
  chatBaseUrl: z.string(),
  chatModel: z.string(),
  hasApiKey: z.boolean(),
  transcriptionBaseUrl: z.string(),
  transcriptionModel: z.string(),
  configured: z.boolean(),
})

export const conversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  updated_at: z.string(),
})
export const messageSchema = aiMessageSchema
export const messagesSchema = aiMessagesSchema

export const metaSchema = z.object({
  settings: workspaceSettingsSchema,
  categories: z.array(categorySchema).readonly(),
  ai: aiStatusSchema,
  backup: z.object({ latestAt: z.string().nullable(), sizeBytes: z.number() }),
  conversations: z.array(conversationSchema).readonly(),
  memories: z.array(aiMemorySchema).readonly(),
  tutorial: z.object({ guideDismissed: z.boolean() }),
})

export const searchResultsSchema = z
  .array(
    z.object({
      id: z.string(),
      type: z.enum(["item", "category", "project", "habit", "gain", "review", "conversation"]),
      title: z.string(),
      detail: z.string().nullable(),
      date: z.string().nullable(),
    }),
  )
  .readonly()

export const habitSummariesSchema = z
  .array(z.object({ localDate: z.string(), completedHabits: z.number() }))
  .readonly()
export const chatResponseSchema = aiChatResponseSchema
