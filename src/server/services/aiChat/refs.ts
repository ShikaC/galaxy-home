// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { categoryIdSchema, itemIdSchema, projectIdSchema } from "../../../shared/items.js"

function resolveEntityRef(value: string, refs: ReadonlyMap<string, string>): string {
  if (!value.startsWith("$")) return value
  const resolved = refs.get(value.slice(1))
  if (resolved === undefined) throw new Error(`未知引用 ${value}`)
  return resolved
}

export function resolveProjectRef(
  database: DatabaseSync,
  value: string,
  refs: ReadonlyMap<string, string>,
): z.infer<typeof projectIdSchema> {
  const resolved = resolveEntityRef(value, refs)
  if (z.uuid().safeParse(resolved).success) return projectIdSchema.parse(resolved)
  const row = z
    .object({ id: z.uuid() })
    .optional()
    .parse(
      database
        .prepare(
          "SELECT id FROM projects WHERE deleted_at IS NULL AND name = ? ORDER BY updated_at DESC LIMIT 1",
        )
        .get(resolved),
    )
  if (row === undefined) throw new Error(`找不到项目「${value}」`)
  return projectIdSchema.parse(row.id)
}

export function resolveItemRef(
  database: DatabaseSync,
  value: string,
  refs: ReadonlyMap<string, string>,
): z.infer<typeof itemIdSchema> {
  const resolved = resolveEntityRef(value, refs)
  if (z.uuid().safeParse(resolved).success) return itemIdSchema.parse(resolved)
  const row = z
    .object({ id: z.uuid() })
    .optional()
    .parse(
      database
        .prepare(
          `SELECT id FROM items WHERE deleted_at IS NULL AND title = ?
           ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
                    updated_at DESC
           LIMIT 1`,
        )
        .get(resolved),
    )
  if (row === undefined) throw new Error(`找不到待办「${value}」`)
  return itemIdSchema.parse(row.id)
}

export function resolveCategoryRef(
  database: DatabaseSync,
  value: string,
  refs: ReadonlyMap<string, string>,
): z.infer<typeof categoryIdSchema> {
  const resolved = resolveEntityRef(value, refs)
  if (z.uuid().safeParse(resolved).success) return categoryIdSchema.parse(resolved)
  const row = z
    .object({ id: z.uuid() })
    .optional()
    .parse(
      database
        .prepare(
          "SELECT id FROM categories WHERE deleted_at IS NULL AND name = ? ORDER BY updated_at DESC LIMIT 1",
        )
        .get(resolved),
    )
  if (row === undefined) throw new Error(`找不到分类「${value}」`)
  return categoryIdSchema.parse(row.id)
}

export function resolveHabitRef(
  database: DatabaseSync,
  value: string,
  refs: ReadonlyMap<string, string>,
): string {
  const resolved = resolveEntityRef(value, refs)
  if (z.uuid().safeParse(resolved).success) return resolved
  const row = z
    .object({ id: z.uuid() })
    .optional()
    .parse(
      database
        .prepare(
          "SELECT id FROM habits WHERE deleted_at IS NULL AND name = ? ORDER BY updated_at DESC LIMIT 1",
        )
        .get(resolved),
    )
  if (row === undefined) throw new Error(`找不到习惯「${value}」`)
  return row.id
}

export function rememberAlias(
  refs: Map<string, string>,
  alias: string | undefined,
  id: string,
): void {
  if (alias === undefined) return
  if (refs.has(alias)) throw new Error(`别名「${alias}」重复`)
  refs.set(alias, id)
}
