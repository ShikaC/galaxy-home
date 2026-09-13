import { z } from "zod"

export const notificationKindSchema = z.enum(["morning", "deadline", "evening", "weekly_review"])

export const notificationSchema = z
  .object({
    id: z.string().uuid(),
    reminderId: z.string().uuid(),
    kind: notificationKindSchema,
    title: z.string(),
    detail: z.string(),
    scheduledAt: z.string(),
    entityId: z.string().nullable(),
  })
  .readonly()

export const notificationsSchema = z.array(notificationSchema).readonly()
export type Notification = z.infer<typeof notificationSchema>

export const snoozeNotificationInputSchema = z
  .object({ minutes: z.number().int().min(5).max(1440), requestId: z.uuid().optional() })
  .readonly()
export type SnoozeNotificationInput = z.infer<typeof snoozeNotificationInputSchema>
export const snoozeNotificationResultSchema = z
  .object({ eventId: z.uuid(), scheduledAt: z.iso.datetime() })
  .readonly()
