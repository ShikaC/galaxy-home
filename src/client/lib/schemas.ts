import { z } from "zod"
import { gainSchema, quoteSchema, weeklyReviewSchema } from "../../shared/app.js"
import { habitSchema } from "../../shared/habits.js"
import { categorySchema, itemSchema } from "../../shared/items.js"
import { projectSchema } from "../../shared/projects.js"
import { notificationsSchema } from "../../shared/reminders.js"
import { workspaceSettingsSchema } from "../../shared/settings.js"

export const itemsSchema = z.array(itemSchema).readonly()
export const habitsSchema = z.array(habitSchema).readonly()
export const projectsSchema = z.array(projectSchema).readonly()
export const gainsSchema = z.array(gainSchema).readonly()
export const reviewsSchema = z.array(weeklyReviewSchema).readonly()
export { gainSchema, habitSchema, itemSchema, notificationsSchema, projectSchema, quoteSchema }

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
export const messageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  references_json: z.string(),
  created_at: z.string(),
})
export const messagesSchema = z.array(messageSchema).readonly()

export const metaSchema = z.object({
  settings: workspaceSettingsSchema,
  categories: z.array(categorySchema).readonly(),
  ai: aiStatusSchema,
  backup: z.object({ latestAt: z.string().nullable(), sizeBytes: z.number() }),
  conversations: z.array(conversationSchema).readonly(),
  memories: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).readonly(),
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
export const chatResponseSchema = z.object({
  conversationId: z.string().uuid(),
  message: messageSchema,
})
