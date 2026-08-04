import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { aiConfigInputSchema, updateSettingsInputSchema } from "../../shared/app.js"
import { onboardingInputSchema } from "../../shared/settings.js"
import type { AppContext } from "../context.js"
import { listCategories } from "../repositories/categories.js"
import { listConversations, listMemories } from "../repositories/conversations.js"
import { getSettings, updateSettings } from "../repositories/settings.js"
import { listTrash, moveToTrash, purgeTrash, restoreTrash } from "../repositories/trash.js"
import { createManualExport, getBackupStatus, restoreManualExport } from "../services/backup.js"
import { completeOnboarding } from "../services/onboarding.js"
import { getAiConfigStatus, writeSecretConfig } from "../services/secrets.js"

const idSchema = z.object({ id: z.string().uuid() })
const memoryUpdateSchema = z.object({ content: z.string().trim().min(1).max(5_000) })

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
  }))
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
    context.database
      .prepare("UPDATE ai_memories SET content = ?, updated_at = ? WHERE id = ?")
      .run(memoryUpdateSchema.parse(request.body).content, new Date().toISOString(), id)
    return reply.code(204).send()
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
