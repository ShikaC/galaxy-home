import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { undoAiAction } from "../../src/server/repositories/aiActions.js"
import { getSettings } from "../../src/server/repositories/settings.js"
import { applyAiChatActions } from "../../src/server/services/aiChatActions.js"

const directories: string[] = []

// 「用 AI 改分类」与「撤上一撤销」共用同一份分类关系写入逻辑。
// 撤销路径自己已开事务，若写入逻辑再开一次，SQLite 会报
// "cannot start a transaction within a transaction"，用户点撤销直接失败。
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

it("撤销 set_item_categories 不因嵌套事务失败", () => {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-nested-tx-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  database.prepare("UPDATE workspace_settings SET ai_permission = ?").run("open")

  applyAiChatActions(
    database,
    getSettings(database),
    `好的。\n\n\`\`\`json
[
  {"action":"create_category","as":"life","name":"剧本-生活","color":"#2f7d5a","icon":"tag"},
  {"action":"create_item","title":"分类生活待办"},
  {"action":"set_item_categories","itemId":"分类生活待办","categoryIds":["$life"]}
]
\`\`\``,
  )

  const action = database
    .prepare("SELECT id FROM ai_action_log WHERE action_type = 'set_item_categories'")
    .get() as { id: string } | undefined
  expect(action).toBeDefined()
  undoAiAction(database, (action as { id: string }).id)
  database.close()
})
