import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { createAiMemoryInputSchema } from "../../shared/ai.js"
import { aiConfigInputSchema, updateSettingsInputSchema } from "../../shared/app.js"
import { snoozeNotificationInputSchema } from "../../shared/reminders.js"
import { onboardingInputSchema } from "../../shared/settings.js"
import { type AppContext, getAppClock } from "../context.js"
import { describeWorkspacePaths, workspacePathEnvOverride } from "../lib/workspacePaths.js"
import { listAiActions, undoAiAction } from "../repositories/aiActions.js"
import { listCategories } from "../repositories/categories.js"
import { listConversations } from "../repositories/conversations.js"
import { createMemory, listMemories, updateMemory } from "../repositories/memories.js"
import { getSettings, updateSettings } from "../repositories/settings.js"
import { listTrash, moveToTrash, purgeTrash, restoreTrash } from "../repositories/trash.js"
import {
  clearTutorialExamples,
  dismissTutorialGuide,
  getTutorialState,
} from "../repositories/tutorial.js"
import { createManualExport, getBackupStatus, restoreManualExport } from "../services/backup.js"
import {
  NotificationSnoozeError,
  requestNotificationSnooze,
} from "../services/notificationSnooze.js"
import { completeOnboarding } from "../services/onboarding.js"
import {
  claimPlatformNotifications,
  dismissNotification,
  listDueNotifications,
} from "../services/scheduler.js"
import { getAiConfigStatus, writeSecretConfig } from "../services/secrets.js"

const idSchema = z.object({ id: z.uuid() })
const memoryUpdateSchema = z.object({ content: z.string().trim().min(1).max(5_000) })

export function registerSystemRoutes(app: FastifyInstance, context: AppContext): void {
  const clock = getAppClock(context)
  app.get("/api/settings", () => getSettings(context.database))
  app.patch("/api/settings", (request) =>
    updateSettings(context.database, updateSettingsInputSchema.parse(request.body)),
  )
  app.post("/api/onboarding", (request) => {
    completeOnboarding(context.database, onboardingInputSchema.parse(request.body), clock.now())
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
    paths: describeWorkspacePaths({
      backupDirectory: context.backupDirectory,
      dataDirectory: context.dataDirectory,
      envOverride: workspacePathEnvOverride(process.env as { readonly GALAXY_DATA_DIR?: string }),
    }),
  }))
  app.post("/api/tutorial/dismiss", (_request, reply) => {
    dismissTutorialGuide(context.database)
    return reply.code(204).send()
  })
  app.post("/api/tutorial/examples/clear", (_request, reply) => {
    clearTutorialExamples(context.database, clock.now())
    return reply.code(204).send()
  })
  app.get("/api/notifications", () => listDueNotifications(context.database, clock.now()))
  // 桌面进程用自己的能力令牌调用，领取一批提醒并弹系统通知。应用内横幅走上面的 GET，
  // 两条通道各自记投递时间，互不吞掉对方的提醒。
  app.post("/api/notifications/platform", () =>
    claimPlatformNotifications(context.database, clock.now()),
  )
  app.post("/api/notifications/:id/snooze", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const input = snoozeNotificationInputSchema.parse(request.body)
    try {
      const result = requestNotificationSnooze(
        context.database,
        { ...input, eventId: id },
        clock.now(),
      )
      return input.requestId === undefined ? reply.code(204).send() : result
    } catch (error) {
      if (error instanceof NotificationSnoozeError)
        return reply.code(error.statusCode).send({ code: error.code, message: error.message })
      throw error
    }
  })
  app.post("/api/notifications/:id/dismiss", (request, reply) => {
    dismissNotification(context.database, idSchema.parse(request.params).id, clock.now())
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
  app.put(
    "/api/ai/config",
    async (request) =>
      await writeSecretConfig(context.secretPath, aiConfigInputSchema.parse(request.body)),
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
    moveToTrash(context.database, "memory", id, row?.content ?? "AI 记忆", clock.now())
    return reply.code(204).send()
  })
  app.get("/api/ai/actions", () => listAiActions(context.database))
  app.post("/api/ai/actions/:id/undo", (request, reply) => {
    undoAiAction(context.database, idSchema.parse(request.params).id)
    return reply.code(204).send()
  })
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
