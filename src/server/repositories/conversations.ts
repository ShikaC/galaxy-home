import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type AiReference, aiMessageSchema, aiReferenceSchema, proposedMemorySchema } from "../../shared/ai.js"
import { pendingChatActionSchema } from "../../shared/aiChatActions.js"

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
  pending_action_json: z.string().nullable().optional(),
  proposed_memory_json: z.string().nullable().optional(),
  created_at: z.string(),
})

export const MAX_CONVERSATIONS = 200
export const MAX_MESSAGES_PER_CONVERSATION = 80

function parseMessage(raw: unknown) {
  const row = messageSchema.parse(raw)
  const pendingAction =
    row.pending_action_json === null || row.pending_action_json === undefined
      ? null
      : pendingChatActionSchema.parse(JSON.parse(row.pending_action_json))
  const proposedMemory =
    row.proposed_memory_json === null || row.proposed_memory_json === undefined
      ? null
      : proposedMemorySchema.parse(JSON.parse(row.proposed_memory_json))
  return aiMessageSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    references: z.array(aiReferenceSchema).parse(JSON.parse(row.references_json)),
    pendingAction,
    proposedMemory,
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
  extras: {
    readonly pendingAction?: unknown
    readonly proposedMemory?: unknown
  } = {},
) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const pendingJson =
    extras.pendingAction === undefined || extras.pendingAction === null
      ? null
      : JSON.stringify(extras.pendingAction)
  const memoryJson =
    extras.proposedMemory === undefined || extras.proposedMemory === null
      ? null
      : JSON.stringify(extras.proposedMemory)
  database
    .prepare(
      `INSERT INTO ai_messages
       (id, conversation_id, role, content, references_json, pending_action_json, proposed_memory_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, conversationId, role, content, JSON.stringify(references), pendingJson, memoryJson, now)
  database
    .prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?")
    .run(now, conversationId)
  return parseMessage({
    id,
    conversation_id: conversationId,
    role,
    content,
    references_json: JSON.stringify(references),
    pending_action_json: pendingJson,
    proposed_memory_json: memoryJson,
    created_at: now,
  })
}

export function getMessage(database: DatabaseSync, messageId: string) {
  const row = database.prepare("SELECT * FROM ai_messages WHERE id = ?").get(messageId)
  return row === undefined ? null : parseMessage(row)
}

export function updateMessagePendingAction(
  database: DatabaseSync,
  messageId: string,
  pendingAction: unknown,
): void {
  database
    .prepare("UPDATE ai_messages SET pending_action_json = ? WHERE id = ?")
    .run(pendingAction === null ? null : JSON.stringify(pendingAction), messageId)
}

export function clearMessageProposedMemory(database: DatabaseSync, messageId: string): void {
  database.prepare("UPDATE ai_messages SET proposed_memory_json = NULL WHERE id = ?").run(messageId)
}

export function listMessages(database: DatabaseSync, conversationId: string) {
  return database
    .prepare("SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(conversationId, MAX_MESSAGES_PER_CONVERSATION)
    .reverse()
    .map(parseMessage)
}
