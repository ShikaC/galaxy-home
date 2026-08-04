import type { FastifyInstance } from "fastify"
import "@fastify/multipart"
import { z } from "zod"
import type { AppContext } from "../context.js"
import {
  addMessage,
  createConversation,
  listMessages,
  renameConversation,
} from "../repositories/conversations.js"
import { moveToTrash } from "../repositories/trash.js"
import { chat, transcribe } from "../services/ai.js"

const chatInputSchema = z.object({
  conversationId: z.string().uuid().nullable(),
  content: z.string().trim().min(1).max(20_000),
})
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
    const body = chatInputSchema.parse(request.body)
    const prior =
      body.conversationId === null
        ? []
        : listMessages(context.database, body.conversationId).map((message) => ({
            role: message.role === "user" ? ("user" as const) : ("assistant" as const),
            content: message.content,
          }))
    const answer = await chat(context.secretPath, [
      ...prior,
      { role: "user" as const, content: body.content },
    ])
    const conversationId =
      body.conversationId ?? createConversation(context.database, body.content.slice(0, 24)).id
    addMessage(context.database, conversationId, "user", body.content)
    const message = addMessage(context.database, conversationId, "assistant", answer)
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
