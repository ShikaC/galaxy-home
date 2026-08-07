import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type AiReference, aiMessageSchema, aiReferenceSchema } from "../../shared/ai.js"

const conversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  updated_at: z.string(),
})
const messageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  references_json: z.string(),
  created_at: z.string(),
})

export const MAX_CONVERSATIONS = 200
export const MAX_MESSAGES_PER_CONVERSATION = 80

function parseMessage(raw: unknown) {
  const row = messageSchema.parse(raw)
  return aiMessageSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    references: z.array(aiReferenceSchema).parse(JSON.parse(row.references_json)),
    createdAt: row.created_at,
  })
}

export function listConversations(database: DatabaseSync) {
  return database
    .prepare(
      "SELECT id, title, updated_at FROM ai_conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?",
    )
    .all(MAX_CONVERSATIONS)
    .map((row) => conversationSchema.parse(row))
}

export function renameConversation(database: DatabaseSync, id: string, title: string): void {
  database
    .prepare("UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?")
    .run(title, new Date().toISOString(), id)
}

export function createConversation(database: DatabaseSync, title: string) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database
    .prepare("INSERT INTO ai_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(id, title, now, now)
  return conversationSchema.parse({ id, title, updated_at: now })
}

export function addMessage(
  database: DatabaseSync,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  references: readonly AiReference[] = [],
) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO ai_messages (id, conversation_id, role, content, references_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, conversationId, role, content, JSON.stringify(references), now)
  database
    .prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?")
    .run(now, conversationId)
  return aiMessageSchema.parse({
    id,
    conversationId,
    role,
    content,
    references,
    createdAt: now,
  })
}

export function listMessages(database: DatabaseSync, conversationId: string) {
  return database
    .prepare("SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(conversationId, MAX_MESSAGES_PER_CONVERSATION)
    .reverse()
    .map(parseMessage)
}
