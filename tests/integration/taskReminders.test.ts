import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { getItem, updateItem } from "../../src/server/repositories/items.js"
import { insertTaskSeries } from "../../src/server/repositories/taskSeries.js"
import {
  dismissNotification,
  listDueNotifications,
  snoozeNotification,
} from "../../src/server/services/scheduler.js"
import { createTaskSeriesInputSchema } from "../../src/shared/recurrence.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-task-reminders-"))
  directories.push(directory)
  const path = join(directory, "test.sqlite")
  const database = openDatabase(path)
  migrateDatabase(database)
  database.exec(
    "UPDATE workspace_settings SET morning_reminder_enabled=0,evening_reminder_enabled=0,weekly_review_enabled=0",
  )
  const id = crypto.randomUUID()
  const now = "2026-09-10T08:00:00.000Z"
  database
    .prepare(`INSERT INTO items(id,title,due_at,scheduled_start_at,scheduled_end_at,schedule_timezone,created_at,updated_at)
    VALUES (?, '客户反馈', '2026-09-10T10:00:00.000Z','2026-09-10T09:00:00.000Z','2026-09-10T09:30:00.000Z','Asia/Shanghai',?,?)`)
    .run(id, now, now)
  const dueId = crypto.randomUUID()
  const scheduledId = crypto.randomUUID()
  database
    .prepare(
      `INSERT INTO task_reminder_rules(id,item_id,anchor,offset_minutes,created_at,updated_at) VALUES (?,?,'due',60,?,?),(?,?,'scheduled',0,?,?)`,
    )
    .run(dueId, id, now, now, scheduledId, id, now, now)
  return { database, path, id, dueId, scheduledId }
}
const now = new Date("2026-09-10T09:05:00.000Z")
describe("task reminder generations", () => {
  it("keeps same-instant rules distinct and repeat polling idempotent", () => {
    // Given
    const { database } = fixture()
    // When
    const first = listDueNotifications(database, now)
    const repeated = listDueNotifications(database, now)
    // Then
    expect(first).toHaveLength(2)
    expect(new Set(first.map((event) => event.id)).size).toBe(2)
    expect(repeated.map((event) => event.id)).toEqual(first.map((event) => event.id))
    database.close()
  })
  it("preserves snooze across a database restart", () => {
    // Given
    const { database, path } = fixture()
    const event = listDueNotifications(database, now)[0]
    if (event === undefined) throw new Error("Expected reminder")
    snoozeNotification(database, event.id, new Date("2026-09-10T09:30:00.000Z"), now)
    database.close()
    const reopened = openDatabase(path)
    // When
    const early = listDueNotifications(reopened, new Date("2026-09-10T09:20:00.000Z"))
    const later = listDueNotifications(reopened, new Date("2026-09-10T09:31:00.000Z"))
    // Then
    expect(early.some((value) => value.id === event.id)).toBe(false)
    expect(later.some((value) => value.id === event.id)).toBe(true)
    reopened.close()
  })
  it("invalidates a late or snoozed event after the task is completed", () => {
    // Given
    const { database, id } = fixture()
    listDueNotifications(database, now)
    database.prepare("UPDATE items SET status='completed' WHERE id=?").run(id)
    // When
    const notifications = listDueNotifications(database, new Date("2026-09-11T09:05:00.000Z"))
    // Then
    expect(notifications).toEqual([])
    expect(database.prepare("SELECT count(*) AS n FROM notification_events").get()).toEqual({
      n: 2,
    })
    database.close()
  })
  it("invalidates removed and moved rules while generating the new time once", () => {
    // Given
    const { database, id, scheduledId } = fixture()
    const old = listDueNotifications(database, now)
    database.prepare("DELETE FROM task_reminder_rules WHERE id=?").run(scheduledId)
    database.prepare("UPDATE items SET due_at='2026-09-10T12:00:00.000Z' WHERE id=?").run(id)
    // When
    const before = listDueNotifications(database, new Date("2026-09-10T10:00:00.000Z"))
    const after = listDueNotifications(database, new Date("2026-09-10T11:05:00.000Z"))
    // Then
    expect(before).toEqual([])
    expect(after).toHaveLength(1)
    expect(old.some((value) => value.id === after[0]?.id)).toBe(false)
    database.close()
  })
  it("adopts already dismissed legacy deadline history without redelivery", () => {
    // Given
    const { database, id, scheduledId } = fixture()
    database.prepare("DELETE FROM task_reminder_rules WHERE id=?").run(scheduledId)
    const reminderId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    database
      .prepare(
        `INSERT INTO reminders(id,kind,entity_id,scheduled_at,created_at,updated_at) VALUES (?,'deadline',?,'2026-09-10T09:00:00.000Z',?,?)`,
      )
      .run(reminderId, id, now.toISOString(), now.toISOString())
    database
      .prepare(
        `INSERT INTO notification_events(id,reminder_id,kind,scheduled_at,created_at) VALUES (?,?,'deadline','2026-09-10T09:00:00.000Z',?)`,
      )
      .run(eventId, reminderId, now.toISOString())
    dismissNotification(database, eventId, now)
    // When
    const notifications = listDueNotifications(database, now)
    // Then
    expect(notifications).toEqual([])
    expect(database.prepare("SELECT count(*) AS n FROM notification_events").get()).toEqual({
      n: 1,
    })
    database.close()
  })

  it("does not revive dismissed reminders when saving unchanged rules with a new title", () => {
    // Given
    const { database, id } = fixture()
    const events = listDueNotifications(database, now)
    for (const event of events) dismissNotification(database, event.id, now)
    const item = getItem(database, id, "2026-09-10")
    // When
    updateItem(
      database,
      id,
      {
        title: "客户反馈已整理",
        expectedVersion: item.version,
        reminders: item.reminders.map((rule) => ({
          anchor: rule.anchor,
          offsetMinutes: rule.offsetMinutes,
        })),
      },
      "2026-09-10",
      now,
    )
    const due = listDueNotifications(database, now)
    // Then
    expect(due).toEqual([])
    expect(database.prepare("SELECT count(*) AS n FROM notification_events").get()).toEqual({
      n: 2,
    })
    database.close()
  })

  it("materializes later recurring instances and reminders after a restart", () => {
    // Given
    const { database, path } = fixture()
    const seriesId = crypto.randomUUID()
    insertTaskSeries(
      database,
      createTaskSeriesInputSchema.parse({
        requestId: seriesId,
        title: "每日反馈",
        timezone: "Asia/Shanghai",
        startDate: "2026-09-10",
        rule: { frequency: "daily", interval: 1 },
        dueTime: "17:00",
        reminders: [{ anchor: "due", offsetMinutes: 0 }],
      }),
      now,
    )
    const first = listDueNotifications(database, now).find((event) =>
      event.title.includes("每日反馈"),
    )
    if (first === undefined) throw new Error("Expected first occurrence reminder")
    dismissNotification(database, first.id, now)
    database.close()
    const restarted = openDatabase(path)
    // When
    const next = listDueNotifications(restarted, new Date("2026-09-11T09:05:00.000Z")).filter(
      (event) => event.title.includes("每日反馈"),
    )
    // Then
    expect(next).toHaveLength(1)
    expect(next[0]?.entityId).not.toBe(first.entityId)
    expect(next[0]?.scheduledAt).toBe("2026-09-11T09:00:00.000Z")
    expect(
      restarted
        .prepare(
          "SELECT COUNT(*) AS n FROM task_occurrences WHERE series_id=? AND occurrence_date='2026-09-11'",
        )
        .get(seriesId),
    ).toEqual({ n: 1 })
    restarted.close()
  })
})
