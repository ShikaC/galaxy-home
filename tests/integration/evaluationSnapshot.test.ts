// @vitest-environment node
import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { migrateDatabase } from "../../src/server/database.js"
import { productSnapshot } from "../../src/server/evaluation/snapshot.js"

it("detects mutations in every product table, including newly added tables", () => {
  const database = new DatabaseSync(":memory:")
  try {
    migrateDatabase(database)
    const before = productSnapshot(database)
    database.exec("UPDATE workspace_settings SET ai_permission = 'open'")
    expect(productSnapshot(database)).not.toBe(before)
    const afterSettings = productSnapshot(database)
    database.exec(
      "CREATE TABLE future_feature (id TEXT); INSERT INTO future_feature VALUES ('unexpected')",
    )
    expect(productSnapshot(database)).not.toBe(afterSettings)
    const afterInsert = productSnapshot(database)
    database.exec("UPDATE future_feature SET id = 'changed'")
    expect(productSnapshot(database)).not.toBe(afterInsert)
    const beforeRun = productSnapshot(database)
    const replaySnapshot = productSnapshot(database, true)
    database.exec(
      "INSERT INTO plan_runs (id, state_json, created_at, updated_at) VALUES ('trace', '{}', 'now', 'now')",
    )
    expect(productSnapshot(database)).toBe(beforeRun)
    expect(productSnapshot(database, true)).not.toBe(replaySnapshot)
  } finally {
    database.close()
  }
})
