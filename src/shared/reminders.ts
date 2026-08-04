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
