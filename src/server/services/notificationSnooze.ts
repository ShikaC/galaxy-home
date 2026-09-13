import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { SnoozeNotificationInput } from "../../shared/reminders.js"
import { withImmediateTransaction } from "../repositories/transaction.js"
import { snoozeNotification } from "./schedulerNotifications.js"

export class NotificationSnoozeError extends Error {
  readonly name = "NotificationSnoozeError"
  constructor(
    readonly code: "SNOOZE_REQUEST_CONFLICT" | "NOTIFICATION_NOT_FOUND",
    message: string,
    readonly statusCode: 404 | 409,
  ) {
    super(message)
  }
}

const requestRowSchema = z
  .object({ request_event_id: z.string(), minutes: z.number().int(), scheduled_at: z.string() })
  .optional()

export function requestNotificationSnooze(
  database: DatabaseSync,
  input: SnoozeNotificationInput & { readonly eventId: string },
  now: Date,
) {
  return withImmediateTransaction(database, () => {
    if (input.requestId !== undefined) {
      const stored = requestRowSchema.parse(
        database
          .prepare(
            "SELECT request_event_id,minutes,scheduled_at FROM notification_snooze_requests WHERE request_id=?",
          )
          .get(input.requestId),
      )
      if (stored !== undefined) {
        if (stored.request_event_id !== input.eventId || stored.minutes !== input.minutes)
          throw new NotificationSnoozeError(
            "SNOOZE_REQUEST_CONFLICT",
            "同一延期请求不能用于不同的提醒或时长",
            409,
          )
        return { eventId: stored.request_event_id, scheduledAt: stored.scheduled_at }
      }
    }
    const event = database
      .prepare("SELECT id FROM notification_events WHERE id=?")
      .get(input.eventId)
    if (event === undefined)
      throw new NotificationSnoozeError("NOTIFICATION_NOT_FOUND", "提醒已不存在", 404)
    const until = new Date(now.getTime() + input.minutes * 60_000)
    snoozeNotification(database, input.eventId, until, now)
    if (input.requestId !== undefined)
      database
        .prepare(`INSERT INTO notification_snooze_requests
      (request_id,event_id,request_event_id,minutes,scheduled_at,created_at) VALUES (?,?,?,?,?,?)`)
        .run(
          input.requestId,
          input.eventId,
          input.eventId,
          input.minutes,
          until.toISOString(),
          now.toISOString(),
        )
    return { eventId: input.eventId, scheduledAt: until.toISOString() }
  })
}
