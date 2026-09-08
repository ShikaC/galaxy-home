import type { Item } from "../../shared/items.js"

export function leftoverYesterdayItems(
  yesterday: readonly Item[],
  today: readonly Item[],
): readonly Item[] {
  const todayIds = new Set(today.map((item) => item.id))
  return yesterday.filter((item) => item.status === "active" && !todayIds.has(item.id))
}
