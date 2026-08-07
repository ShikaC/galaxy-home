import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { TodayItemInput } from "../../shared/items.js"

const countRowSchema = z.object({ count: z.number().int().nonnegative() })

export class TodayLimitError extends Error {
  readonly name = "TodayLimitError"

  constructor() {
    super("今日主要待办最多只能有 3 个")
  }
}

export function setTodayItem(database: DatabaseSync, input: TodayItemInput) {
  const count = countRowSchema.parse(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM today_items
         JOIN items ON items.id = today_items.item_id
         WHERE today_items.local_date = ? AND today_items.is_secondary = 0
           AND today_items.item_id != ? AND items.status = 'active' AND items.deleted_at IS NULL`,
      )
      .get(input.localDate, input.itemId),
  ).count
  if (!input.isSecondary && count >= 3) {
    throw new TodayLimitError()
  }
  database.exec("BEGIN IMMEDIATE")
  try {
    if (input.isFocus) {
      database
        .prepare("UPDATE today_items SET is_focus = 0 WHERE local_date = ?")
        .run(input.localDate)
    }
    database
      .prepare(
        `INSERT INTO today_items (local_date, item_id, sort_order, is_focus, is_secondary)
         VALUES (?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM today_items WHERE local_date = ?), 0), ?, ?)
         ON CONFLICT(local_date, item_id) DO UPDATE SET
           is_focus = excluded.is_focus, is_secondary = excluded.is_secondary`,
      )
      .run(
        input.localDate,
        input.itemId,
        input.localDate,
        Number(input.isFocus),
        Number(input.isSecondary),
      )
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

export function clearTodayItem(database: DatabaseSync, itemId: string, localDate: string): void {
  database.prepare("DELETE FROM today_items WHERE item_id = ? AND local_date = ?").run(itemId, localDate)
}

export function reorderTodayItems(
  database: DatabaseSync,
  localDate: string,
  itemIds: readonly string[],
): void {
  database.exec("BEGIN IMMEDIATE")
  try {
    const statement = database.prepare(
      "UPDATE today_items SET sort_order = ? WHERE local_date = ? AND item_id = ?",
    )
    itemIds.forEach((itemId, index) => {
      statement.run(index, localDate, itemId)
    })
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
