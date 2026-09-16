// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。
import type { DatabaseSync } from "node:sqlite"
import { itemIdSchema } from "../../../shared/items.js"
import { getItem } from "../../repositories/items.js"
import { setTodayItem } from "../../repositories/todayItems.js"
import { recordAction } from "./summary.js"

export function placeItemToday(
  database: DatabaseSync,
  itemId: string,
  localDate: string,
  mode: "today" | "focus" | "secondary",
): void {
  const previousItem = getItem(database, itemId, localDate)
  const previous = {
    inToday: previousItem.inToday,
    isFocus: previousItem.isFocus,
    isSecondary: previousItem.isSecondary,
  }
  if (mode === "secondary") {
    setTodayItem(database, {
      itemId: itemIdSchema.parse(itemId),
      localDate,
      isFocus: false,
      isSecondary: true,
    })
  } else {
    setTodayItem(database, {
      itemId: itemIdSchema.parse(itemId),
      localDate,
      isFocus: mode === "focus",
      isSecondary: false,
    })
  }
  recordAction(
    database,
    "set_today",
    mode === "secondary"
      ? "将待办加入今日次要"
      : mode === "focus"
        ? "将待办设为今日焦点"
        : "将待办加入今日",
    "item",
    itemId,
    { kind: "set_today", itemId, localDate, previous },
  )
}
