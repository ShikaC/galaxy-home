import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { createManualExport, restoreManualExport } from "../../src/server/services/backup.js"

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-snooze-"))
  const path = join(directory, "db.sqlite")
  let database = openDatabase(path)
  migrateDatabase(database)
  let now = new Date("2026-09-10T08:00:00.000Z")
  const context = () => ({
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath: join(directory, "secrets.json"),
    clock: { now: () => now },
  })
  let app = await buildApp(context())
  const id = crypto.randomUUID()
  const reminderId = crypto.randomUUID()
  database
    .prepare(
      "INSERT INTO reminders(id,kind,scheduled_at,created_at,updated_at) VALUES (?,'morning',?,?,?)",
    )
    .run(reminderId, now.toISOString(), now.toISOString(), now.toISOString())
  database
    .prepare(
      "INSERT INTO notification_events(id,reminder_id,kind,scheduled_at,created_at) VALUES (?,?,'morning',?,?)",
    )
    .run(id, reminderId, now.toISOString(), now.toISOString())
  cleanups.push(async () => {
    await app.close()
    database.close()
    rmSync(directory, { recursive: true, force: true })
  })
  return {
    id,
    directory,
    get database() {
      return database
    },
    get app() {
      return app
    },
    advance() {
      now = new Date(now.getTime() + 600000)
    },
    async restart() {
      await app.close()
      database.close()
      database = openDatabase(path)
      app = await buildApp(context())
    },
  }
}
it("replays the original snooze result after an unknown response and restart", async () => {
  // Given
  const context = await setup()
  const requestId = crypto.randomUUID()
  const request = {
    method: "POST" as const,
    url: `/api/notifications/${context.id}/snooze`,
    payload: { requestId, minutes: 30 },
  }
  const original = await context.app.inject(request)
  context.advance()
  await context.restart()
  // When
  const retry = await context.app.inject(request)
  // Then
  expect(retry.statusCode).toBe(200)
  expect(retry.json()).toEqual(original.json())
  expect(
    context.database
      .prepare("SELECT scheduled_at FROM notification_events WHERE id=?")
      .get(context.id),
  ).toEqual({ scheduled_at: "2026-09-10T08:30:00.000Z" })
})
it("rejects reuse of a snooze request for a different duration", async () => {
  // Given
  const context = await setup()
  const requestId = crypto.randomUUID()
  await context.app.inject({
    method: "POST",
    url: `/api/notifications/${context.id}/snooze`,
    payload: { requestId, minutes: 30 },
  })
  // When
  const retry = await context.app.inject({
    method: "POST",
    url: `/api/notifications/${context.id}/snooze`,
    payload: { requestId, minutes: 60 },
  })
  // Then
  expect(retry.statusCode).toBe(409)
  expect(
    context.database
      .prepare("SELECT scheduled_at FROM notification_events WHERE id=?")
      .get(context.id),
  ).toEqual({ scheduled_at: "2026-09-10T08:30:00.000Z" })
})
it("preserves snooze identities through export and restoration", async () => {
  // Given
  const context = await setup()
  const requestId = crypto.randomUUID()
  const request = {
    method: "POST" as const,
    url: `/api/notifications/${context.id}/snooze`,
    payload: { requestId, minutes: 30 },
  }
  await context.app.inject(request)
  await restoreManualExport(
    context.database,
    createManualExport(context.database),
    join(context.directory, "backups"),
  )
  context.advance()
  // When
  await context.app.inject(request)
  // Then
  expect(
    context.database
      .prepare("SELECT scheduled_at FROM notification_events WHERE id=?")
      .get(context.id),
  ).toEqual({ scheduled_at: "2026-09-10T08:30:00.000Z" })
})
it("keeps the legacy request without an id compatible", async () => {
  // Given
  const context = await setup()
  // When
  const response = await context.app.inject({
    method: "POST",
    url: `/api/notifications/${context.id}/snooze`,
    payload: { minutes: 30 },
  })
  // Then
  expect(response.statusCode).toBe(204)
  expect(
    context.database
      .prepare("SELECT scheduled_at FROM notification_events WHERE id=?")
      .get(context.id),
  ).toEqual({ scheduled_at: "2026-09-10T08:30:00.000Z" })
})

it("replays a historical request after its event is deleted and rejects another event", async () => {
  // Given
  const context = await setup()
  const requestId = crypto.randomUUID()
  const request = {
    method: "POST" as const,
    url: `/api/notifications/${context.id}/snooze`,
    payload: { requestId, minutes: 30 },
  }
  const first = await context.app.inject(request)
  context.database.prepare("DELETE FROM notification_events WHERE id=?").run(context.id)
  // When
  const replay = await context.app.inject(request)
  const reused = await context.app.inject({
    ...request,
    url: `/api/notifications/${crypto.randomUUID()}/snooze`,
  })
  // Then
  expect(replay.statusCode).toBe(200)
  expect(replay.json()).toEqual(first.json())
  expect(reused.statusCode).toBe(409)
})
it("rolls back the snooze if recording its idempotency key fails", async () => {
  // Given
  const context = await setup()
  context.database.exec(
    "CREATE TRIGGER fail_snooze BEFORE INSERT ON notification_snooze_requests BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
  )
  // When
  const response = await context.app.inject({
    method: "POST",
    url: `/api/notifications/${context.id}/snooze`,
    payload: { requestId: crypto.randomUUID(), minutes: 30 },
  })
  // Then
  expect(response.statusCode).toBe(500)
  expect(
    context.database
      .prepare("SELECT scheduled_at FROM notification_events WHERE id=?")
      .get(context.id),
  ).toEqual({ scheduled_at: "2026-09-10T08:00:00.000Z" })
  expect(
    context.database.prepare("SELECT count(*) AS n FROM notification_snooze_requests").get(),
  ).toEqual({ n: 0 })
})
