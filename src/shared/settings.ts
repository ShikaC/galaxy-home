import { z } from "zod"

export const aiPermissionSchema = z.enum(["conservative", "open"])
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format()
      return true
    } catch {
      return false
    }
  }, "请选择有效时区")

export const onboardingInputSchema = z
  .object({
    workspaceName: z.string().trim().min(1).max(60),
    aiNickname: z.string().trim().min(1).max(30),
    userName: z.string().trim().min(1).max(30),
    timezone: timezoneSchema,
  })
  .readonly()

export type OnboardingInput = z.infer<typeof onboardingInputSchema>

export const workspaceSettingsSchema = z
  .object({
    workspaceName: z.string(),
    aiNickname: z.string(),
    userName: z.string(),
    timezone: z.string(),
    aiPermission: aiPermissionSchema,
    onboardingCompleted: z.boolean(),
    backupRetentionDays: z.number().int(),
    trashRetentionDays: z.number().int(),
    morningReminderTime: z.string(),
    morningReminderEnabled: z.boolean(),
    eveningReminderTime: z.string(),
    eveningReminderEnabled: z.boolean(),
    weeklyReviewTime: z.string(),
    weeklyReviewEnabled: z.boolean(),
  })
  .readonly()

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>
