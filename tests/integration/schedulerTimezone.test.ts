// @vitest-environment node
import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { migrateDatabase } from "../../src/server/database.js"
import { dismissNotification, listDueNotifications } from "../../src/server/services/scheduler.js"

it("does not create another daily reminder when the workspace changes timezone on the same day", () => {
  const database = new DatabaseSync(":memory:")
  try {
    migrateDatabase(database)
    const now = new Date("2026-08-05T14:00:00Z")
    const morning = listDueNotifications(database, now).find((item) => item.kind === "morning")
    if (morning === undefined) throw new Error("Missing morning reminder")
    dismissNotification(database, morning.id, now)
    database.exec("UPDATE workspace_settings SET timezone = 'UTC'")
    expect(
      listDueNotifications(database, now).filter((item) => item.kind === "morning"),
    ).toHaveLength(0)
    database.exec("UPDATE workspace_settings SET timezone = 'Asia/Shanghai'")
    expect(
      listDueNotifications(database, now).filter((item) => item.kind === "morning"),
    ).toHaveLength(0)
    expect(
      listDueNotifications(database, new Date("2026-08-06T14:00:00Z")).filter(
        (item) => item.kind === "morning",
      ),
    ).toHaveLength(1)
  } finally {
    database.close()
  }
})
