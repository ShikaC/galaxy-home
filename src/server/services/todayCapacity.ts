import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"

// 今日主位上限：超出后新加入的任务落为次要。
// 这条规则原先散落在 AI 会话动作、计划执行、以及旧 planning 服务里各自实现，现统一到这里。
export const PRIMARY_TODAY_LIMIT = 3

export function countPrimaryTodayItems(database: DatabaseSync, localDate: string): number {
  return z.object({ count: z.number().int().nonnegative() }).parse(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM today_items
           JOIN items ON items.id = today_items.item_id
           WHERE today_items.local_date = ? AND today_items.is_secondary = 0
             AND items.status = 'active' AND items.deleted_at IS NULL`,
      )
      .get(localDate),
  ).count
}

export function hasPrimaryTodaySlot(database: DatabaseSync, localDate: string): boolean {
  return countPrimaryTodayItems(database, localDate) < PRIMARY_TODAY_LIMIT
}
