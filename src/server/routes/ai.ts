import type { FastifyInstance } from "fastify"
import "@fastify/multipart"
import { z } from "zod"
import { aiChatInputSchema } from "../../shared/ai.js"
import { type AppContext, getAppClock } from "../context.js"
import { listMessages, renameConversation } from "../repositories/conversations.js"
import { moveToTrash } from "../repositories/trash.js"
import { AiServiceError, chat, streamChat, transcribe } from "../services/ai.js"
import { completeAiChat, persistAiChat, prepareAiChat } from "../services/aiChat.js"
import { getAiConfigStatus } from "../services/secrets.js"

const idSchema = z.object({ id: z.string().uuid() })
const titleSchema = z.object({ title: z.string().trim().min(1).max(80) })

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
  app.post("/api/transcribe", async (request) => {
    const part = await request.file()
    if (part === undefined) throw new Error("没有收到录音")
    const bytes = await part.toBuffer()
    return { text: await transcribe(context.secretPath, bytes, part.filename, part.mimetype) }
  })
}
