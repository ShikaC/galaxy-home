// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getSettings } from "../../src/server/repositories/settings.js"
import { applyAiChatActions } from "../../src/server/services/aiChatActions.js"
import { itemSchema } from "../../src/shared/items.js"

it("uses the workspace clock for onboarding, completion and AI today placement", async () => {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-clock-"))
  const database = openDatabase(join(directory, "db.sqlite"))
  migrateDatabase(database)
  const instant = new Date("2025-01-01T16:30:00Z")
  const app = await buildApp({
    database,
    secretPath: "",
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    clock: { now: () => instant },
  })
  try {
    await app.inject({
      method: "POST",
      url: "/api/onboarding",
      payload: {
        workspaceName: "工作空间",
        aiNickname: "星伴",
        userName: "用户",
        timezone: "Asia/Shanghai",
      },
    })
    expect(
      database.prepare("SELECT onboarding_completed_at FROM workspace_settings").get(),
    ).toEqual({ onboarding_completed_at: instant.toISOString() })
    const created = itemSchema.parse(
      (
        await app.inject({ method: "POST", url: "/api/items", payload: { title: "本地时钟" } })
      ).json(),
    )
    const updated = itemSchema.parse(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/items/${created.id}`,
          payload: { status: "completed" },
        })
      ).json(),
    )
    expect(updated.completedAt).toBe(instant.toISOString())
    const settings = { ...getSettings(database), aiPermission: "open" as const }
    applyAiChatActions(
      database,
      settings,
      '```json\n{"action":"create_item","title":"AI 时钟","todayMode":"today"}\n```',
      instant,
    )
    expect(database.prepare("SELECT local_date FROM today_items").all()).toEqual([
      { local_date: "2025-01-02" },
    ])
  } finally {
    await app.close()
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
