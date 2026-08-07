import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { listCategories } from "../repositories/categories.js"
import { getItem } from "../repositories/items.js"
import { getSettings } from "../repositories/settings.js"
import { chatStructured } from "./ai.js"
import { localClock } from "./time.js"

const suggestionSchema = z
  .object({
    categoryIds: z.array(z.string().uuid()).max(20),
    suggestToday: z.boolean().default(false),
    note: z.string().max(500).optional(),
  })
  .readonly()

export async function suggestItemCategories(
  database: DatabaseSync,
  secretPath: string,
  itemId: string,
) {
  const settings = getSettings(database)
  const localDate = localClock(new Date(), settings.timezone).date
  const item = getItem(database, itemId, localDate)
  const categories = listCategories(database)
  if (categories.length === 0) {
    return { categoryIds: [] as string[], suggestToday: false, note: "还没有可建议的分类" }
  }
  const result = await chatStructured(
    secretPath,
    [
      {
        role: "system",
        content:
          "你是整理助手。只返回 JSON：{categoryIds:string[],suggestToday:boolean,note?:string}。categoryIds 只能从给定分类 id 中选择，可为空，不要发明新分类。",
      },
      {
        role: "user",
        content: JSON.stringify({
          item: { id: item.id, title: item.title, notes: item.notes },
          categories: categories.map((category) => ({ id: category.id, name: category.name })),
        }),
      },
    ],
    suggestionSchema,
  )
  const allowed = new Set(categories.map((category) => String(category.id)))
  return {
    categoryIds: result.categoryIds.filter((id) => allowed.has(id)),
    suggestToday: result.suggestToday,
    note: result.note ?? null,
  }
}
