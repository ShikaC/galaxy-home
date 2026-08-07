import type { FastifyInstance } from "fastify"
import "@fastify/multipart"
import { z } from "zod"
import { aiChatInputSchema, aiMessageSchema } from "../../shared/ai.js"
import { pendingChatActionSchema } from "../../shared/aiChatActions.js"
import { type AppContext, getAppClock } from "../context.js"
import {
  clearMessageProposedMemory,
  getMessage,
  listMessages,
  renameConversation,
  updateMessagePendingAction,
} from "../repositories/conversations.js"
import { getSettings } from "../repositories/settings.js"
import { moveToTrash } from "../repositories/trash.js"
import { AiServiceError, chat, streamChat, transcribe } from "../services/ai.js"
import { completeAiChat, persistAiChat, prepareAiChat } from "../services/aiChat.js"
import { executeChatActions } from "../services/aiChatActions.js"
import { getAiConfigStatus } from "../services/secrets.js"
import { suggestItemCategories } from "../services/aiCategorySuggest.js"

const idSchema = z.object({ id: z.string().uuid() })
const titleSchema = z.object({ title: z.string().trim().min(1).max(80) })
const messageIdSchema = z.object({ messageId: z.string().uuid() })
const suggestBodySchema = z.object({ itemId: z.string().uuid() })

export function registerAiRoutes(app: FastifyInstance, context: AppContext): void {
  const clock = getAppClock(context)
  app.get("/api/ai/conversations/:id/messages", (request) =>
    listMessages(context.database, idSchema.parse(request.params).id),
  )
  app.patch("/api/ai/conversations/:id", (request, reply) => {
    renameConversation(
      context.database,
      idSchema.parse(request.params).id,
      titleSchema.parse(request.body).title,
    )
    return reply.code(204).send()
  })
  app.delete("/api/ai/conversations/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const row = z
      .object({ title: z.string() })
      .optional()
      .parse(context.database.prepare("SELECT title FROM ai_conversations WHERE id = ?").get(id))
    moveToTrash(context.database, "conversation", id, row?.title ?? "AI 会话", clock.now())
    return reply.code(204).send()
  })
  app.post("/api/ai/chat", async (request) => {
    const prepared = prepareAiChat(context.database, aiChatInputSchema.parse(request.body))
    const answer = await completeAiChat(context.secretPath, prepared)
    return persistAiChat(context.database, prepared, answer)
  })
  app.post("/api/ai/chat/stream", async (request, reply) => {
    const prepared = prepareAiChat(context.database, aiChatInputSchema.parse(request.body))
    if (!getAiConfigStatus(context.secretPath).configured) {
      throw new AiServiceError("AI_NOT_CONFIGURED", "AI 尚未配置，手动流程仍可正常使用")
    }
    reply.hijack()
    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    })
    const writeEvent = (event: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    try {
      const answer = await streamChat(context.secretPath, prepared.messages, (content) => {
        writeEvent({ type: "delta", content })
      })
      writeEvent({ type: "done", ...persistAiChat(context.database, prepared, answer) })
    } catch (error) {
      const serviceError =
        error instanceof AiServiceError
          ? error
          : new AiServiceError("AI_UNAVAILABLE", "AI 流式响应中断")
      writeEvent({ type: "error", code: serviceError.code, message: serviceError.message })
    } finally {
      reply.raw.end()
    }
  })
  app.post("/api/ai/test", async () => ({
    message: await chat(context.secretPath, [{ role: "user", content: "只回复：连接成功" }]),
  }))
  app.post("/api/ai/messages/:messageId/confirm-action", (request) => {
    const { messageId } = messageIdSchema.parse(request.params)
    const message = getMessage(context.database, messageId)
    if (message === null || message.pendingAction === null || message.pendingAction.status !== "pending")
      throw new Error("没有待确认的操作")
    const settings = getSettings(context.database)
    const confirmation = executeChatActions(
      context.database,
      settings,
      message.pendingAction.actions,
    )
    const next = pendingChatActionSchema.parse({
      ...message.pendingAction,
      status: "confirmed",
    })
    updateMessagePendingAction(context.database, messageId, next)
    const updated = getMessage(context.database, messageId)
    return {
      message: aiMessageSchema.parse(updated),
      confirmation,
    }
  })
  app.post("/api/ai/messages/:messageId/reject-action", (request) => {
    const { messageId } = messageIdSchema.parse(request.params)
    const message = getMessage(context.database, messageId)
    if (message === null || message.pendingAction === null || message.pendingAction.status !== "pending")
      throw new Error("没有待确认的操作")
    updateMessagePendingAction(
      context.database,
      messageId,
      pendingChatActionSchema.parse({ ...message.pendingAction, status: "rejected" }),
    )
    return { message: aiMessageSchema.parse(getMessage(context.database, messageId)) }
  })
  app.post("/api/ai/messages/:messageId/dismiss-memory", (request, reply) => {
    clearMessageProposedMemory(context.database, messageIdSchema.parse(request.params).messageId)
    return reply.code(204).send()
  })
  app.post("/api/ai/suggest-categories", async (request) => {
    const body = suggestBodySchema.parse(request.body)
    return suggestItemCategories(context.database, context.secretPath, body.itemId)
  })
  app.post("/api/transcribe", async (request) => {
    if (!getAiConfigStatus(context.secretPath).configured) {
      throw new AiServiceError(
        "AI_NOT_CONFIGURED",
        "尚未配置转写服务；请先在设置中填写 AI 或转写地址。未转写成功时不会创建条目。",
      )
    }
    const part = await request.file()
    if (part === undefined) throw new Error("没有收到录音")
    const bytes = await part.toBuffer()
    return { text: await transcribe(context.secretPath, bytes, part.filename, part.mimetype) }
  })
}
