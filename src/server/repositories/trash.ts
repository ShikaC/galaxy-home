import type { DatabaseSync } from "node:sqlite"
import { addDays } from "date-fns"
import { z } from "zod"
import { getSettings } from "./settings.js"

const entitySchema = z.enum([
  "item",
  "project",
  "habit",
  "gain",
  "quote",
  "category",
  "review",
  "conversation",
  "memory",
])
export type TrashEntity = z.infer<typeof entitySchema>

const entityTable: Readonly<Record<TrashEntity, string>> = {
  item: "items",
  project: "projects",
  habit: "habits",
  gain: "daily_gains",
  quote: "quotes",
  category: "categories",
  review: "weekly_reviews",
  conversation: "ai_conversations",
  memory: "ai_memories",
}

export const trashEntrySchema = z.object({
  id: z.string().uuid(),
  entity_type: entitySchema,
  entity_id: z.string().uuid(),
  display_name: z.string(),
  deleted_at: z.string(),
  purge_after: z.string(),
})

export function moveToTrash(
  database: DatabaseSync,
  rawEntity: string,
  entityId: string,
  displayName: string,
  now = new Date(),
): void {
  const entity = entitySchema.parse(rawEntity)
  const deletedAt = now.toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(`UPDATE ${entityTable[entity]} SET deleted_at = ? WHERE id = ?`)
      .run(deletedAt, entityId)
    database
      .prepare(
        `INSERT INTO trash_entries (id, entity_type, entity_id, display_name, deleted_at, purge_after)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET display_name = excluded.display_name,
       deleted_at = excluded.deleted_at, purge_after = excluded.purge_after`,
      )
      .run(
        crypto.randomUUID(),
        entity,
        entityId,
        displayName,
        deletedAt,
        addDays(now, getSettings(database).trashRetentionDays).toISOString(),
      )
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

export function listTrash(database: DatabaseSync) {
  return database
    .prepare("SELECT * FROM trash_entries ORDER BY deleted_at DESC")
    .all()
    .map((row) => trashEntrySchema.parse(row))
}

export function restoreTrash(database: DatabaseSync, trashId: string): void {
  const row = trashEntrySchema.parse(
    database.prepare("SELECT * FROM trash_entries WHERE id = ?").get(trashId),
  )
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(`UPDATE ${entityTable[row.entity_type]} SET deleted_at = NULL WHERE id = ?`)
      .run(row.entity_id)
    database.prepare("DELETE FROM trash_entries WHERE id = ?").run(trashId)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

export function purgeTrash(database: DatabaseSync, trashId: string): void {
  const row = trashEntrySchema.parse(
    database.prepare("SELECT * FROM trash_entries WHERE id = ?").get(trashId),
  )
  database.exec("BEGIN IMMEDIATE")
  try {
    database.prepare(`DELETE FROM ${entityTable[row.entity_type]} WHERE id = ?`).run(row.entity_id)
    database.prepare("DELETE FROM trash_entries WHERE id = ?").run(trashId)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

export function purgeExpiredTrash(database: DatabaseSync, now = new Date()): number {
  const entries = z
    .array(z.object({ id: z.string().uuid() }))
    .parse(
      database
        .prepare("SELECT id FROM trash_entries WHERE purge_after <= ? ORDER BY purge_after")
        .all(now.toISOString()),
    )
  for (const entry of entries) purgeTrash(database, entry.id)
  return entries.length
}
