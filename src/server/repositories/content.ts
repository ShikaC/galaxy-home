import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type Gain, gainSchema, type Quote, quoteSchema } from "../../shared/app.js"

const gainRowSchema = z.object({
  id: z.string().uuid(),
  local_date: z.string(),
  content: z.string(),
  created_at: z.string(),
})
const quoteRowSchema = z.object({ id: z.string().uuid(), content: z.string() })

export function createGain(database: DatabaseSync, localDate: string, content: string): Gain {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database
    .prepare(
      "INSERT INTO daily_gains (id, local_date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, localDate, content, now, now)
  return gainSchema.parse({ id, localDate, content, createdAt: now })
}

export function listGains(database: DatabaseSync, localDate?: string): readonly Gain[] {
  const rows =
    localDate === undefined
      ? database
          .prepare(
            "SELECT * FROM daily_gains WHERE deleted_at IS NULL ORDER BY local_date DESC, created_at DESC",
          )
          .all()
      : database
          .prepare(
            "SELECT * FROM daily_gains WHERE local_date = ? AND deleted_at IS NULL ORDER BY created_at DESC",
          )
          .all(localDate)
  return rows.map((raw) => {
    const row = gainRowSchema.parse(raw)
    return gainSchema.parse({
      id: row.id,
      localDate: row.local_date,
      content: row.content,
      createdAt: row.created_at,
    })
  })
}

export function updateGain(database: DatabaseSync, gainId: string, content: string): void {
  database
    .prepare(
      "UPDATE daily_gains SET content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .run(content, new Date().toISOString(), gainId)
}

export function getDailyQuote(database: DatabaseSync, localDate: string): Quote | null {
  const selected = database
    .prepare(
      `SELECT quotes.id, quotes.content FROM daily_quote_selections
       JOIN quotes ON quotes.id = daily_quote_selections.quote_id
       WHERE local_date = ? AND quotes.enabled = 1 AND quotes.deleted_at IS NULL`,
    )
    .get(localDate)
  if (selected !== undefined) return quoteSchema.parse(selected)
  const row = database
    .prepare(
      "SELECT id, content FROM quotes WHERE enabled = 1 AND deleted_at IS NULL ORDER BY random() LIMIT 1",
    )
    .get()
  if (row === undefined) return null
  const quote = quoteRowSchema.parse(row)
  database
    .prepare(
      `INSERT INTO daily_quote_selections (local_date, quote_id, selected_at) VALUES (?, ?, ?)
       ON CONFLICT(local_date) DO UPDATE SET quote_id = excluded.quote_id,
         selected_at = excluded.selected_at`,
    )
    .run(localDate, quote.id, new Date().toISOString())
  return quoteSchema.parse(quote)
}

export function nextDailyQuote(database: DatabaseSync, localDate: string): Quote | null {
  const current = getDailyQuote(database, localDate)
  const alternative = database
    .prepare(
      `SELECT id, content FROM quotes
       WHERE enabled = 1 AND deleted_at IS NULL AND id != ? ORDER BY random() LIMIT 1`,
    )
    .get(current?.id ?? "")
  const row = alternative ?? current
  if (row === undefined) return null
  const quote = quoteRowSchema.parse(row)
  database
    .prepare(
      `INSERT INTO daily_quote_selections (local_date, quote_id, selected_at) VALUES (?, ?, ?)
     ON CONFLICT(local_date) DO UPDATE SET quote_id = excluded.quote_id, selected_at = excluded.selected_at`,
    )
    .run(localDate, quote.id, new Date().toISOString())
  return quoteSchema.parse(quote)
}

export function listQuotes(database: DatabaseSync) {
  return database
    .prepare(
      "SELECT id, content, enabled, is_system FROM quotes WHERE deleted_at IS NULL ORDER BY is_system DESC, created_at",
    )
    .all()
}

export function createQuote(database: DatabaseSync, content: string): Quote {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database
    .prepare(
      "INSERT INTO quotes (id, content, enabled, is_system, created_at, updated_at) VALUES (?, ?, 1, 0, ?, ?)",
    )
    .run(id, content, now, now)
  return quoteSchema.parse({ id, content })
}

export function updateQuote(
  database: DatabaseSync,
  id: string,
  content: string,
  enabled: boolean,
): void {
  database
    .prepare("UPDATE quotes SET content = ?, enabled = ?, updated_at = ? WHERE id = ?")
    .run(content, Number(enabled), new Date().toISOString(), id)
}
