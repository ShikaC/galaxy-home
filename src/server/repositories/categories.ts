import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  type Category,
  type CreateCategoryInput,
  categoryIdSchema,
  categorySchema,
  type Item,
} from "../../shared/items.js"

const countRowSchema = z.object({ count: z.number().int().nonnegative() })
const categoryRowSchema = z.object({
  id: categoryIdSchema,
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  sort_order: z.number().int(),
})

function readCategory(raw: unknown): Category {
  const row = categoryRowSchema.parse(raw)
  return categorySchema.parse({
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
  })
}

export function listCategories(database: DatabaseSync): readonly Category[] {
  return database
    .prepare(
      "SELECT id, name, color, icon, sort_order FROM categories WHERE deleted_at IS NULL ORDER BY sort_order",
    )
    .all()
    .map(readCategory)
}

export function createCategory(database: DatabaseSync, input: CreateCategoryInput): Category {
  const id = categoryIdSchema.parse(crypto.randomUUID())
  const now = new Date().toISOString()
  const order = countRowSchema.parse(
    database.prepare("SELECT COUNT(*) AS count FROM categories WHERE deleted_at IS NULL").get(),
  ).count
  database
    .prepare(
      `INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.name, input.color, input.icon, order, now, now)
  const row = readCategory(
    database
      .prepare("SELECT id, name, color, icon, sort_order FROM categories WHERE id = ?")
      .get(id),
  )
  return row
}

export function updateCategory(
  database: DatabaseSync,
  id: string,
  input: CreateCategoryInput,
): Category {
  database
    .prepare(
      `UPDATE categories SET name = ?, color = ?, icon = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(input.name, input.color, input.icon, new Date().toISOString(), id)
  return readCategory(
    database
      .prepare("SELECT id, name, color, icon, sort_order FROM categories WHERE id = ?")
      .get(id),
  )
}

export function replaceItemCategories(
  database: DatabaseSync,
  itemId: Item["id"],
  categoryIds: readonly Category["id"][],
) {
  database.exec("BEGIN IMMEDIATE")
  try {
    database.prepare("DELETE FROM item_categories WHERE item_id = ?").run(itemId)
    const statement = database.prepare(
      "INSERT INTO item_categories (item_id, category_id, sort_order) VALUES (?, ?, ?)",
    )
    categoryIds.forEach((categoryId, index) => {
      statement.run(itemId, categoryId, index)
    })
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
