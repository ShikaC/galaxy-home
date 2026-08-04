import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type AiMemoryKind, aiMemoryKindSchema, aiMemorySchema } from "../../shared/ai.js"

const memoryRowSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  kind: aiMemoryKindSchema,
  confirmed_at: z.string(),
  updated_at: z.string(),
})

export type { AiMemoryKind }

function parseMemory(raw: unknown) {
  const row = memoryRowSchema.parse(raw)
  return aiMemorySchema.parse({
    id: row.id,
    content: row.content,
    kind: row.kind,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  })
}

export function listMemories(database: DatabaseSync) {
  return database
    .prepare(
      `SELECT id, content, kind, confirmed_at, updated_at FROM ai_memories
       WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
    )
    .all()
    .map(parseMemory)
}

export function createMemory(database: DatabaseSync, content: string, kind: AiMemoryKind) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO ai_memories (id, content, kind, confirmed_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, content, kind, now, now)
  return parseMemory(database.prepare("SELECT * FROM ai_memories WHERE id = ?").get(id))
}

export function updateMemory(database: DatabaseSync, id: string, content: string): void {
  database
    .prepare("UPDATE ai_memories SET content = ?, updated_at = ? WHERE id = ?")
    .run(content, new Date().toISOString(), id)
}
