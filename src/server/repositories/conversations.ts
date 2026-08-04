import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"

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

export function listConversations(database: DatabaseSync) {
  return database
    .prepare(
      "SELECT id, title, updated_at FROM ai_conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC",
    )
    .all()
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
) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO ai_messages (id, conversation_id, role, content, references_json, created_at)
     VALUES (?, ?, ?, ?, '[]', ?)`,
    )
    .run(id, conversationId, role, content, now)
  database
    .prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?")
    .run(now, conversationId)
  return messageSchema.parse({
    id,
    conversation_id: conversationId,
    role,
    content,
    references_json: "[]",
    created_at: now,
  })
}

export function listMessages(database: DatabaseSync, conversationId: string) {
  return database
    .prepare("SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at")
    .all(conversationId)
    .map((row) => messageSchema.parse(row))
}

export function listMemories(database: DatabaseSync) {
  return database
    .prepare(
      "SELECT id, content, kind, confirmed_at, updated_at FROM ai_memories WHERE deleted_at IS NULL ORDER BY updated_at DESC",
    )
    .all()
}
