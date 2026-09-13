import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Fastify from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { registerCalendarRoutes } from "../../src/server/routes/calendar.js"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("calendar routes", () => {
  it("returns all-day assignments separately from deadlines", async () => {
    // Given
    const directory = mkdtempSync(join(tmpdir(), "galaxy-calendar-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const id = crypto.randomUUID()
    database
      .prepare(
        "INSERT INTO items (id,title,status,created_at,updated_at,due_date) VALUES (?,?,'active',?,?,?)",
      )
      .run(id, "交付方案", "2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z", "2026-09-11")
    database
      .prepare(
        "INSERT INTO today_items (local_date,item_id,is_focus,is_secondary,sort_order) VALUES (?,?,0,0,0)",
      )
      .run("2026-09-10", id)
    const app = Fastify()
    registerCalendarRoutes(app, {
      database,
      dataDirectory: directory,
      backupDirectory: directory,
      secretPath: join(directory, "secret"),
    })

    // When
    const response = await app.inject({
      method: "GET",
      url: "/api/calendar?startDate=2026-09-10&endDate=2026-09-12&timezone=Asia%2FShanghai",
    })

    // Then
    expect(response.statusCode).toBe(200)
    const body = response.json<{
      allDay: readonly { id: string }[]
      deadlines: readonly { id: string }[]
    }>()
    expect(body.allDay.map((item) => item.id)).toEqual([id])
    expect(body.deadlines.map((item) => item.id)).toEqual([id])
    await app.close()
    database.close()
  })
})

it("excludes skipped and next-month instances from this week using occurrence metadata", async () => {
  // Given
  const { createTaskSeries } = await import("../../src/server/services/recurrence.js")
  const { buildCalendarSnapshot } = await import("../../src/server/services/calendar.js")
  const directory = mkdtempSync(join(tmpdir(), "galaxy-calendar-series-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  createTaskSeries(
    database,
    {
      requestId: crypto.randomUUID(),
      title: "工作日客户反馈",
      priority: "none",
      categoryIds: [],
      projectIds: [],
      timezone: "Asia/Shanghai",
      startDate: "2026-09-10",
      rule: { frequency: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] },
      estimatedMinutes: 30,
      reminders: [],
    },
    "2026-09-10",
    new Date("2026-09-10T00:00:00.000Z"),
  )
  database
    .prepare("UPDATE task_occurrences SET status='skipped' WHERE occurrence_date='2026-09-10'")
    .run()
  // When
  const result = buildCalendarSnapshot(database, {
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    timezone: "Asia/Shanghai",
  })
  // Then
  expect(result.unscheduled.map((item) => item.recurrenceDate)).toEqual(["2026-09-11"])
  expect(result.items).toHaveLength(1)
  database.close()
})

it("saves explicit manual fixed-event edits in the validated transaction", async () => {
  // Given
  const { createItem, getItem } = await import("../../src/server/repositories/items.js")
  const { createItemInputSchema, itemSchema } = await import("../../src/shared/items.js")
  const directory = mkdtempSync(join(tmpdir(), "galaxy-calendar-save-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
  const item = createItem(
    database,
    createItemInputSchema.parse({
      title: "固定会议",
      categoryIds: [],
      projectIds: [],
      isFixed: true,
      scheduledStartAt: "2026-09-10T01:00:00.000Z",
      scheduledEndAt: "2026-09-10T02:00:00.000Z",
      scheduleTimezone: "Asia/Shanghai",
    }),
    "2026-09-10",
    new Date("2026-09-10T00:00:00.000Z"),
  )
  const app = Fastify()
  registerCalendarRoutes(app, {
    database,
    dataDirectory: directory,
    backupDirectory: directory,
    secretPath: join(directory, "secret"),
  })
  // When
  const response = await app.inject({
    method: "POST",
    url: "/api/calendar/schedule",
    payload: {
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      timezone: "Asia/Shanghai",
      changes: [
        {
          itemId: item.id,
          expectedVersion: item.version,
          scheduledStartAt: "2026-09-10T02:00:00.000Z",
          scheduledEndAt: "2026-09-10T03:00:00.000Z",
          scheduleTimezone: "Asia/Shanghai",
        },
      ],
    },
  })
  // Then
  expect(response.statusCode).toBe(200)
  const saved = itemSchema.parse(response.json())
  expect(saved.scheduledStartAt).toBe("2026-09-10T02:00:00.000Z")
  expect(getItem(database, item.id, "2026-09-10").version).toBe(saved.version)
  expect(saved.isFixed).toBe(true)
  await app.close()
  database.close()
})
