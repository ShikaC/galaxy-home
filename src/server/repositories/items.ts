import type { DatabaseSync } from "node:sqlite"
import { assertNever } from "../../shared/assertNever.js"
import {
  type CreateItemInput,
  type Item,
  type ItemQuery,
  itemIdSchema,
  type UpdateItemInput,
} from "../../shared/items.js"
import { readItem, readItemRows } from "./itemRows.js"

export { createCategory, replaceItemCategories } from "./categories.js"
export { setTodayItem, TodayLimitError } from "./todayItems.js"

export class ItemNotFoundError extends Error {
  readonly name = "ItemNotFoundError"

  constructor(readonly itemId: string) {
    super(`Item not found: ${itemId}`)
  }
}

export function getItem(database: DatabaseSync, itemId: string, localDate: string): Item {
  const row = database
    .prepare("SELECT * FROM items WHERE id = ? AND deleted_at IS NULL")
    .get(itemId)
  if (row === undefined) {
    throw new ItemNotFoundError(itemId)
  }
  return readItem(database, row, localDate)
}

export function createItem(
  database: DatabaseSync,
  input: CreateItemInput,
  localDate = new Date().toISOString().slice(0, 10),
): Item {
  const id = itemIdSchema.parse(crypto.randomUUID())
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `INSERT INTO items
         (id, title, notes, due_at, reminder_minutes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        id,
        input.title,
        input.notes ?? null,
        input.dueAt ?? null,
        input.reminderMinutes ?? null,
        now,
        now,
      )
    const categoryStatement = database.prepare(
      "INSERT INTO item_categories (item_id, category_id, sort_order) VALUES (?, ?, ?)",
    )
    input.categoryIds.forEach((categoryId, index) => {
      categoryStatement.run(id, categoryId, index)
    })
    const projectStatement = database.prepare(
      "INSERT INTO item_projects (item_id, project_id) VALUES (?, ?)",
    )
    input.projectIds.forEach((projectId) => {
      projectStatement.run(id, projectId)
    })
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
  return getItem(database, id, localDate)
}

export function copyItem(database: DatabaseSync, itemId: string, localDate: string): Item {
  const item = getItem(database, itemId, localDate)
  return createItem(
    database,
    {
      title: `${item.title} 副本`,
      categoryIds: [...item.categoryIds],
      projectIds: [...item.projectIds],
      ...(item.notes === null ? {} : { notes: item.notes }),
      ...(item.dueAt === null ? {} : { dueAt: item.dueAt }),
      ...(item.reminderMinutes === null ? {} : { reminderMinutes: item.reminderMinutes }),
    },
    localDate,
  )
}

export function listItems(database: DatabaseSync, query: ItemQuery): readonly Item[] {
  if (query.categoryId !== undefined) {
    return readItemRows(
      database,
      database
        .prepare(
          `SELECT items.* FROM items
           JOIN item_categories ON item_categories.item_id = items.id
           WHERE item_categories.category_id = ? AND items.status = 'active'
             AND items.deleted_at IS NULL
           ORDER BY item_categories.sort_order, items.created_at DESC`,
        )
        .all(query.categoryId),
      query.localDate,
    )
  }
  if (query.projectId !== undefined) {
    return readItemRows(
      database,
      database
        .prepare(
          `SELECT items.* FROM items
           JOIN item_projects ON item_projects.item_id = items.id
           WHERE item_projects.project_id = ? AND items.status = 'active'
             AND items.deleted_at IS NULL
           ORDER BY items.sort_order, items.created_at DESC`,
        )
        .all(query.projectId),
      query.localDate,
    )
  }

  switch (query.view) {
    case "inbox":
      return readItemRows(
        database,
        database
          .prepare(
            `SELECT items.* FROM items
             WHERE items.status = 'active' AND items.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM item_categories WHERE item_id = items.id)
               AND NOT EXISTS (SELECT 1 FROM item_projects WHERE item_id = items.id)
             ORDER BY items.created_at DESC`,
          )
          .all(),
        query.localDate,
      )
    case "today":
      return readItemRows(
        database,
        database
          .prepare(
            `SELECT items.* FROM items
             JOIN today_items ON today_items.item_id = items.id
             WHERE today_items.local_date = ? AND items.deleted_at IS NULL
             ORDER BY today_items.is_secondary, today_items.sort_order`,
          )
          .all(query.localDate),
        query.localDate,
      )
    case "active":
    case "completed":
    case "archived":
      return readItemRows(
        database,
        database
          .prepare(
            "SELECT * FROM items WHERE status = ? AND deleted_at IS NULL ORDER BY sort_order, created_at DESC",
          )
          .all(query.view),
        query.localDate,
      )
    default:
      return assertNever(query.view)
  }
}

export function updateItem(
  database: DatabaseSync,
  itemId: string,
  input: UpdateItemInput,
  localDate = new Date().toISOString().slice(0, 10),
): Item {
  const existing = getItem(database, itemId, localDate)
  const status = input.status ?? existing.status
  const dueAt = input.dueAt === undefined ? existing.dueAt : input.dueAt
  const reminder =
    input.reminderMinutes === undefined ? existing.reminderMinutes : input.reminderMinutes
  const now = new Date().toISOString()
  const convertsTutorial =
    input.title !== undefined ||
    input.notes !== undefined ||
    input.dueAt !== undefined ||
    input.reminderMinutes !== undefined
  database
    .prepare(
      `UPDATE items SET title = ?, notes = ?, due_at = ?, reminder_minutes = ?, status = ?,
       completed_at = ?, is_tutorial = CASE WHEN ? = 1 THEN 0 ELSE is_tutorial END,
       updated_at = ? WHERE id = ?`,
    )
    .run(
      input.title ?? existing.title,
      input.notes === undefined ? existing.notes : input.notes,
      dueAt,
      dueAt === null ? null : reminder,
      status,
      status === "completed" ? (existing.completedAt ?? now) : null,
      Number(convertsTutorial),
      now,
      itemId,
    )
  return getItem(database, itemId, localDate)
}
