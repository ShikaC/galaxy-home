import type { DatabaseSync } from "node:sqlite"

export const TUTORIAL_ITEM_ID = "e787bd76-25ca-4353-bf6d-733c15ef02f9" as const
export const TUTORIAL_HABIT_ID = "ce64d6c6-23c0-4076-b094-28d02b51d89a" as const

export function seedTutorialExamples(database: DatabaseSync, now = new Date().toISOString()): void {
  database
    .prepare(
      `INSERT OR IGNORE INTO items
       (id, title, notes, status, is_tutorial, created_at, updated_at)
       VALUES (?, '试着完成一个小待办', '这是教学示例。编辑后会转为真实数据。', 'active', 1, ?, ?)`,
    )
    .run(TUTORIAL_ITEM_ID, now, now)
  database
    .prepare(
      `INSERT OR IGNORE INTO habits
       (id, name, type, target_count, frequency_type, rest_days_json,
        active, is_tutorial, created_at, updated_at)
       VALUES (?, '喝一杯水', 'check', 1, 'daily', '[]', 1, 1, ?, ?)`,
    )
    .run(TUTORIAL_HABIT_ID, now, now)
}
