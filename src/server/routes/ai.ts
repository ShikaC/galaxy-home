import type { FastifyInstance } from "fastify"
import "@fastify/multipart"
import { z } from "zod"
import { aiChatInputSchema } from "../../shared/ai.js"
import type { AppContext } from "../context.js"
import {
  addMessage,
  createConversation,
  listMessages,
  renameConversation,
} from "../repositories/conversations.js"
import { getSettings } from "../repositories/settings.js"
import { moveToTrash } from "../repositories/trash.js"
import { chat, transcribe } from "../services/ai.js"
import { buildAiContext } from "../services/aiContext.js"

const idSchema = z.object({ id: z.string().uuid() })
const titleSchema = z.object({ title: z.string().trim().min(1).max(80) })

export function registerAiRoutes(app: FastifyInstance, context: AppContext): void {
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
    moveToTrash(context.database, "conversation", id, row?.title ?? "AI 会话")
    return reply.code(204).send()
  })
  app.post("/api/ai/chat", async (request) => {
    const body = aiChatInputSchema.parse(request.body)
    const settings = getSettings(context.database)
    const prior =
      body.conversationId === null
        ? []
        : listMessages(context.database, body.conversationId).map((message) => ({
            role: message.role === "user" ? ("user" as const) : ("assistant" as const),
            content: message.content,
          }))
    const localContext = buildAiContext(
      context.database,
      settings,
      body.currentPath,
      body.currentLabel,
      body.content,
    )
    const answer = await chat(context.secretPath, [
      {
        role: "system",
        content: `你是${settings.aiNickname}，称呼用户为${settings.userName}。语气温和务实，不批评、不制造内疚。先识别精力和阻碍，再缩小到当前可做的最小动作，也允许休息和重新规划。不要声称掌握实时新闻、天气或价格。以下是本次允许参考的本地上下文：${localContext.prompt}`,
      },
      ...prior,
      { role: "user", content: body.content },
    ])
    const conversationId =
      body.conversationId ?? createConversation(context.database, body.content.slice(0, 24)).id
    addMessage(context.database, conversationId, "user", body.content)
    const message = addMessage(
      context.database,
      conversationId,
      "assistant",
      answer,
      localContext.references,
    )
    return { conversationId, message }
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
