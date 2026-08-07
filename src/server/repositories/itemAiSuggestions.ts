import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"

const rowSchema = z.object({
  item_id: z.string().uuid(),
  status: z.enum(["waiting", "ready", "failed"]),
  category_ids_json: z.string(),
  suggest_today: z.number().int(),
  note: z.string().nullable(),
  updated_at: z.string(),
})

export type ItemAiSuggestion = {
  readonly itemId: string
  readonly status: "waiting" | "ready" | "failed"
  readonly categoryIds: readonly string[]
  readonly suggestToday: boolean
  readonly note: string | null
  readonly updatedAt: string
}

function parse(raw: unknown): ItemAiSuggestion {
  const row = rowSchema.parse(raw)
  return {
    itemId: row.item_id,
    status: row.status,
    categoryIds: z.array(z.string().uuid()).parse(JSON.parse(row.category_ids_json)),
    suggestToday: row.suggest_today === 1,
    note: row.note,
    updatedAt: row.updated_at,
  }
}

export function markItemAiSuggestionWaiting(database: DatabaseSync, itemId: string): void {
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO item_ai_suggestions (item_id, status, category_ids_json, suggest_today, note, updated_at)
       VALUES (?, 'waiting', '[]', 0, NULL, ?)
       ON CONFLICT(item_id) DO UPDATE SET status = 'waiting', updated_at = excluded.updated_at`,
    )
    .run(itemId, now)
}

export function saveItemAiSuggestion(
  database: DatabaseSync,
  itemId: string,
  input: {
    readonly status: "ready" | "failed"
    readonly categoryIds: readonly string[]
    readonly suggestToday: boolean
    readonly note: string | null
  },
): ItemAiSuggestion {
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO item_ai_suggestions (item_id, status, category_ids_json, suggest_today, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         status = excluded.status,
         category_ids_json = excluded.category_ids_json,
         suggest_today = excluded.suggest_today,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    )
    .run(
      itemId,
      input.status,
      JSON.stringify(input.categoryIds),
      Number(input.suggestToday),
      input.note,
      now,
    )
  return parse(database.prepare("SELECT * FROM item_ai_suggestions WHERE item_id = ?").get(itemId))
}

export function getItemAiSuggestion(database: DatabaseSync, itemId: string): ItemAiSuggestion | null {
  const row = database.prepare("SELECT * FROM item_ai_suggestions WHERE item_id = ?").get(itemId)
  return row === undefined ? null : parse(row)
}
