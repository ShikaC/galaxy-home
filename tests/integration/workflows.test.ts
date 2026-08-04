import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { completeOnboarding } from "../../src/server/services/onboarding.js"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

async function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-workflows-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  completeOnboarding(database, {
    workspaceName: "银河居所",
    aiNickname: "星伴",
    userName: "小河",
    timezone: "Asia/Shanghai",
  })
  const app = await buildApp({
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: join(directory, "secrets.json"),
  })
  return { app, database }
}

describe("daily workflows", () => {
  it("persists dismissal of the quick-start guide", async () => {
    const { app, database } = await createTestApp()
    const before = await app.inject({ method: "GET", url: "/api/meta" })
    expect(before.json<{ tutorial: { guideDismissed: boolean } }>().tutorial.guideDismissed).toBe(
      false,
    )
    expect((await app.inject({ method: "POST", url: "/api/tutorial/dismiss" })).statusCode).toBe(
      204,
    )
    const after = await app.inject({ method: "GET", url: "/api/meta" })
    expect(after.json<{ tutorial: { guideDismissed: boolean } }>().tutorial.guideDismissed).toBe(
      true,
    )
    await app.close()
    database.close()
  })

  it("turns edited and copied tutorial items into real data", async () => {
    const { app, database } = await createTestApp()
    const tutorial = z
      .object({ id: z.string().uuid() })
      .optional()
      .parse(database.prepare("SELECT id FROM items WHERE is_tutorial = 1").get())
    expect(tutorial).toBeDefined()
    if (tutorial === undefined) return
    const copied = await app.inject({ method: "POST", url: `/api/items/${tutorial.id}/copy` })
    expect(copied.statusCode).toBe(201)
    expect(copied.json<{ isTutorial: boolean }>().isTutorial).toBe(false)
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/items/${tutorial.id}`,
      payload: { title: "我的第一个真实待办" },
    })
    expect(edited.json<{ isTutorial: boolean }>().isTutorial).toBe(false)
    await app.close()
    database.close()
  })

  it("manages tutorial habits and exposes corrected history through HTTP", async () => {
    const { app, database } = await createTestApp()
    const tutorial = z
      .object({ id: z.string().uuid() })
      .optional()
      .parse(database.prepare("SELECT id FROM habits WHERE is_tutorial = 1").get())
    expect(tutorial).toBeDefined()
    if (tutorial === undefined) return

    const copied = await app.inject({ method: "POST", url: `/api/habits/${tutorial.id}/copy` })
    expect(copied.statusCode).toBe(201)
    const copiedHabit = z
      .object({ id: z.string().uuid(), isTutorial: z.boolean() })
      .parse(copied.json())
    expect(copiedHabit.isTutorial).toBe(false)

    const edited = await app.inject({
      method: "PATCH",
      url: `/api/habits/${tutorial.id}`,
      payload: {
        name: "我的阅读习惯",
        type: "count",
        targetCount: 2,
        frequencyType: "daily",
        weeklyTarget: null,
        restDays: [],
      },
    })
    expect(edited.json()).toEqual(
      expect.objectContaining({ isTutorial: false, name: "我的阅读习惯" }),
    )

    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/habit-logs",
          payload: {
            habitId: copiedHabit.id,
            localDate: "2026-08-03",
            count: 1,
            status: "active",
            corrected: true,
          },
        })
      ).statusCode,
    ).toBe(204)
    const history = await app.inject({ method: "GET", url: "/api/habits?localDate=2026-08-03" })
    expect(history.json()).toContainEqual(
      expect.objectContaining({ id: copiedHabit.id, correctedToday: true }),
    )

    expect(
      (await app.inject({ method: "DELETE", url: `/api/habits/${copiedHabit.id}` })).statusCode,
    ).toBe(204)
    const trash = await app.inject({ method: "GET", url: "/api/trash" })
    expect(trash.json()).toContainEqual(
      expect.objectContaining({ entity_id: copiedHabit.id, entity_type: "habit" }),
    )
    const summaries = await app.inject({
      method: "GET",
      url: "/api/habits/summaries?start=2026-08-03&end=2026-08-03",
    })
    expect(summaries.json()).toEqual([])
    await app.close()
    database.close()
  })

  it("converts an item into a project and archives the source item", async () => {
    const { app, database } = await createTestApp()
    const item = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "筹备搬家", notes: "九月完成", categoryIds: [], projectIds: [] },
    })
    const itemId = item.json<{ id: string }>().id
    const converted = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/convert-to-project`,
    })
    expect(converted.statusCode).toBe(201)
    expect(converted.json()).toEqual(
      expect.objectContaining({
        name: "筹备搬家",
        currentTask: expect.objectContaining({ title: "筹备搬家" }),
      }),
    )
    const archived = await app.inject({
      method: "GET",
      url: "/api/items?view=archived&localDate=2026-08-04",
    })
    expect(archived.json<readonly { id: string }[]>()).toContainEqual(
      expect.objectContaining({ id: itemId }),
    )
    await app.close()
    database.close()
  })

  it("persists category item order", async () => {
    const { app, database } = await createTestApp()
    const category = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: "家务", color: "#26734d", icon: "home" },
    })
    const categoryId = category.json<{ id: string }>().id
    const first = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "甲", categoryIds: [categoryId], projectIds: [] },
    })
    const second = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "乙", categoryIds: [categoryId], projectIds: [] },
    })
    const firstId = first.json<{ id: string }>().id
    const secondId = second.json<{ id: string }>().id
    const reordered = await app.inject({
      method: "PUT",
      url: `/api/categories/${categoryId}/items/reorder`,
      payload: { itemIds: [secondId, firstId] },
    })
    expect(reordered.statusCode).toBe(204)
    const items = await app.inject({
      method: "GET",
      url: `/api/items?view=active&localDate=2026-08-04&categoryId=${categoryId}`,
    })
    expect(items.json<readonly { id: string }[]>().map((item) => item.id)).toEqual([
      secondId,
      firstId,
    ])
    await app.close()
    database.close()
  })

  it("filters search by type and date and includes AI message content", async () => {
    const { app, database } = await createTestApp()
    const now = "2026-08-04T00:00:00.000Z"
    const conversationId = crypto.randomUUID()
    database
      .prepare(
        "INSERT INTO ai_conversations (id, title, created_at, updated_at) VALUES (?, '计划讨论', ?, ?)",
      )
      .run(conversationId, now, now)
    database
      .prepare(
        "INSERT INTO ai_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', '寻找搬家清单', ?)",
      )
      .run(crypto.randomUUID(), conversationId, now)
    const results = await app.inject({
      method: "GET",
      url: "/api/search?q=%E6%90%AC%E5%AE%B6&type=conversation&dateFrom=2026-08-01&dateTo=2026-08-05",
    })
    expect(results.statusCode).toBe(200)
    expect(results.json()).toContainEqual(
      expect.objectContaining({ id: conversationId, type: "conversation", detail: "寻找搬家清单" }),
    )
    await app.close()
    database.close()
  })
})
