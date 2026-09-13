import type { DatabaseSync } from "node:sqlite"
import type { TodayItemInput } from "../../shared/items.js"
import { ItemNotFoundError, ItemVersionConflictError } from "./taskErrors.js"
import { withImmediateTransaction } from "./transaction.js"

function assertTodayVersion(
  database: DatabaseSync,
  itemId: string,
  expectedVersion: number | undefined,
): void {
  const row = database
    .prepare("SELECT version FROM items WHERE id=? AND deleted_at IS NULL")
    .get(itemId) as { version?: unknown } | undefined
  if (row === undefined || typeof row.version !== "number") throw new ItemNotFoundError(itemId)
  if (expectedVersion !== undefined && row.version !== expectedVersion)
    throw new ItemVersionConflictError(itemId, row.version)
}

export function setTodayItem(database: DatabaseSync, input: TodayItemInput): void {
  withImmediateTransaction(database, () => {
    assertTodayVersion(database, input.itemId, input.expectedVersion)
    if (input.isFocus)
      database
        .prepare("UPDATE today_items SET is_focus=0 WHERE local_date=? AND item_id!=?")
        .run(input.localDate, input.itemId)
    database
      .prepare(
        `INSERT INTO today_items(local_date,item_id,sort_order,is_focus,is_secondary)
       VALUES(?,?,COALESCE((SELECT MAX(sort_order)+1 FROM today_items WHERE local_date=?),0),?,?)
       ON CONFLICT(local_date,item_id) DO UPDATE SET is_focus=excluded.is_focus,is_secondary=excluded.is_secondary`,
      )
      .run(
        input.localDate,
        input.itemId,
        input.localDate,
        Number(input.isFocus),
        Number(input.isSecondary),
      )
  })
}

export function addToTodayOrSecondary(
  database: DatabaseSync,
  itemId: TodayItemInput["itemId"],
  localDate: string,
): void {
  setTodayItem(database, { itemId, localDate, isFocus: false, isSecondary: false })
}

export function clearTodayItem(
  database: DatabaseSync,
  itemId: string,
  localDate: string,
  expectedVersion?: number,
): void {
  withImmediateTransaction(database, () => {
    assertTodayVersion(database, itemId, expectedVersion)
    database
      .prepare("DELETE FROM today_items WHERE item_id=? AND local_date=?")
      .run(itemId, localDate)
  })
}

export function reorderTodayItems(
  database: DatabaseSync,
  localDate: string,
  itemIds: readonly string[],
): void {
  withImmediateTransaction(database, () => {
    const statement = database.prepare(
      "UPDATE today_items SET sort_order=? WHERE local_date=? AND item_id=?",
    )
    itemIds.forEach((itemId, index) => {
      statement.run(index, localDate, itemId)
    })
  })
}
