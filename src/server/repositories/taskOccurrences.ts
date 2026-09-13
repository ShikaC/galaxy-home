import type { DatabaseSync, SQLOutputValue } from "node:sqlite"
import { z } from "zod"

const occurrenceRowSchema = z.object({
  series_id: z.string().uuid(),
  occurrence_date: z.string(),
  item_id: z.string().uuid().nullable(),
  status: z.enum(["active", "skipped"]),
  is_exception: z.number().int(),
})

export type TaskOccurrence = {
  readonly seriesId: string
  readonly occurrenceDate: string
  readonly itemId: string | null
  readonly status: "active" | "skipped"
  readonly isException: boolean
}

export function claimOccurrence(
  database: DatabaseSync,
  seriesId: string,
  occurrenceDate: string,
  instant: Date,
): boolean {
  const now = instant.toISOString()
  return (
    database
      .prepare(
        `INSERT OR IGNORE INTO task_occurrences
         (series_id, occurrence_date, item_id, status, is_exception, created_at, updated_at)
         VALUES (?, ?, NULL, 'active', 0, ?, ?)`,
      )
      .run(seriesId, occurrenceDate, now, now).changes === 1
  )
}

export function attachOccurrenceItem(
  database: DatabaseSync,
  seriesId: string,
  occurrenceDate: string,
  itemId: string,
  instant: Date,
): void {
  database
    .prepare(
      `UPDATE task_occurrences SET item_id = ?, updated_at = ?
       WHERE series_id = ? AND occurrence_date = ? AND item_id IS NULL AND status = 'active'`,
    )
    .run(itemId, instant.toISOString(), seriesId, occurrenceDate)
}

function readOccurrence(row: Record<string, SQLOutputValue>): TaskOccurrence {
  const parsed = occurrenceRowSchema.parse(row)
  return {
    seriesId: parsed.series_id,
    occurrenceDate: parsed.occurrence_date,
    itemId: parsed.item_id,
    status: parsed.status,
    isException: parsed.is_exception === 1,
  }
}

export function getOccurrenceByItem(database: DatabaseSync, itemId: string): TaskOccurrence | null {
  const row = database.prepare("SELECT * FROM task_occurrences WHERE item_id = ?").get(itemId)
  return row === undefined ? null : readOccurrence(row)
}

export function setOccurrenceStatus(
  database: DatabaseSync,
  itemId: string,
  status: "active" | "skipped",
  instant: Date,
): boolean {
  return (
    database
      .prepare("UPDATE task_occurrences SET status = ?, updated_at = ? WHERE item_id = ?")
      .run(status, instant.toISOString(), itemId).changes === 1
  )
}
