import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { createAiMemoryInputSchema } from "../../shared/ai.js"
import { aiConfigInputSchema, updateSettingsInputSchema } from "../../shared/app.js"
import { onboardingInputSchema } from "../../shared/settings.js"
import type { AppContext } from "../context.js"
import { listCategories } from "../repositories/categories.js"
import { listConversations } from "../repositories/conversations.js"
import { createMemory, listMemories, updateMemory } from "../repositories/memories.js"
import { getSettings, updateSettings } from "../repositories/settings.js"
import { listTrash, moveToTrash, purgeTrash, restoreTrash } from "../repositories/trash.js"
import { dismissTutorialGuide, getTutorialState } from "../repositories/tutorial.js"
import { createManualExport, getBackupStatus, restoreManualExport } from "../services/backup.js"
import { completeOnboarding } from "../services/onboarding.js"
import {
  dismissNotification,
  listDueNotifications,
  snoozeNotification,
} from "../services/scheduler.js"
import { getAiConfigStatus, writeSecretConfig } from "../services/secrets.js"

const idSchema = z.object({ id: z.string().uuid() })
const memoryUpdateSchema = z.object({ content: z.string().trim().min(1).max(5_000) })
const snoozeSchema = z.object({ minutes: z.number().int().min(5).max(1_440) })

export function registerSystemRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/api/settings", () => getSettings(context.database))
  app.patch("/api/settings", (request) =>
    updateSettings(context.database, updateSettingsInputSchema.parse(request.body)),
  )
  app.post("/api/onboarding", (request) => {
    completeOnboarding(context.database, onboardingInputSchema.parse(request.body))
    return getSettings(context.database)
  })
  app.get("/api/meta", () => ({
    settings: getSettings(context.database),
    categories: listCategories(context.database),
    ai: getAiConfigStatus(context.secretPath),
    backup: getBackupStatus(context.backupDirectory),
    conversations: listConversations(context.database),
    memories: listMemories(context.database),
    tutorial: getTutorialState(context.database),
  }))
  app.post("/api/tutorial/dismiss", (_request, reply) => {
    dismissTutorialGuide(context.database)
    return reply.code(204).send()
  })
  app.get("/api/notifications", () => listDueNotifications(context.database))
  app.post("/api/notifications/:id/snooze", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const { minutes } = snoozeSchema.parse(request.body)
    snoozeNotification(context.database, id, new Date(Date.now() + minutes * 60_000))
    return reply.code(204).send()
  })
  app.post("/api/notifications/:id/dismiss", (request, reply) => {
    dismissNotification(context.database, idSchema.parse(request.params).id)
    return reply.code(204).send()
  })
  app.get("/api/trash", () => listTrash(context.database))
  app.post("/api/trash/:id/restore", (request, reply) => {
    restoreTrash(context.database, idSchema.parse(request.params).id)
    return reply.code(204).send()
  })
  app.delete("/api/trash/:id", (request, reply) => {
    purgeTrash(context.database, idSchema.parse(request.params).id)
    return reply.code(204).send()
  })
  app.get("/api/ai/config", () => getAiConfigStatus(context.secretPath))
  app.put("/api/ai/config", (request) =>
    writeSecretConfig(context.secretPath, aiConfigInputSchema.parse(request.body)),
  )
  app.patch("/api/ai/memories/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    updateMemory(context.database, id, memoryUpdateSchema.parse(request.body).content)
    return reply.code(204).send()
  })
  app.post("/api/ai/memories", (request, reply) => {
    const input = createAiMemoryInputSchema.parse(request.body)
    return reply.code(201).send(createMemory(context.database, input.content, input.kind))
  })
  app.delete("/api/ai/memories/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const row = z
      .object({ content: z.string() })
      .optional()
      .parse(context.database.prepare("SELECT content FROM ai_memories WHERE id = ?").get(id))
    moveToTrash(context.database, "memory", id, row?.content ?? "AI 记忆")
    return reply.code(204).send()
  })
  app.get("/api/ai/actions", () =>
    context.database
      .prepare("SELECT * FROM ai_action_log ORDER BY created_at DESC LIMIT 100")
      .all(),
  )
  app.get("/api/export", (_request, reply) =>
    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", 'attachment; filename="galaxy-home.zip"')
      .send(Buffer.from(createManualExport(context.database))),
  )
  app.post("/api/restore", async (request, reply) => {
    const bytes = z.instanceof(Buffer).parse(request.body)
    await restoreManualExport(context.database, bytes, context.backupDirectory)
    return reply.code(204).send()
  })
}
