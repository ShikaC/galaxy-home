import type { DatabaseSync } from "node:sqlite"
import type { OnboardingInput } from "../../shared/settings.js"

const DEFAULT_QUOTES = [
  ["40dff5ea-b977-48ca-b62f-f62034afbc7c", "先照顾当下，再决定下一步。"],
  ["48e9bda5-c396-4266-a5d6-da2d7d670380", "不必一次做完，只要让事情向前一点。"],
  ["72bf968d-0872-4d6f-9a26-3eb65657038c", "休息不是离开轨道，而是在为下一程蓄力。"],
  ["a95fd3df-ab22-4ee6-bab5-c6cf3cfd67e9", "把模糊的担心，写成一个可以开始的小动作。"],
  ["bb39dff9-2a88-4b19-9aa1-f8e3f7ec6d23", "今天能完成的，已经足够。"],
] as const

const TUTORIAL_ITEM_ID = "e787bd76-25ca-4353-bf6d-733c15ef02f9"
const TUTORIAL_HABIT_ID = "ce64d6c6-23c0-4076-b094-28d02b51d89a"

export function completeOnboarding(database: DatabaseSync, input: OnboardingInput) {
  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `UPDATE workspace_settings
         SET workspace_name = ?, ai_nickname = ?, user_name = ?, timezone = ?,
             onboarding_completed = 1, updated_at = ?
         WHERE id = 1`,
      )
      .run(input.workspaceName, input.aiNickname, input.userName, input.timezone, now)

    const insertQuote = database.prepare(
      `INSERT OR IGNORE INTO quotes
       (id, content, enabled, is_system, created_at, updated_at)
       VALUES (?, ?, 1, 1, ?, ?)`,
    )
    for (const quote of DEFAULT_QUOTES) {
      insertQuote.run(quote[0], quote[1], now, now)
    }

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
    database
      .prepare("UPDATE tutorial_state SET examples_created = 1, updated_at = ? WHERE id = 1")
      .run(now)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
