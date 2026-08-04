import { z } from "zod"

export const aiPermissionSchema = z.enum(["conservative", "open"])

export const onboardingInputSchema = z
  .object({
    workspaceName: z.string().trim().min(1).max(60),
    aiNickname: z.string().trim().min(1).max(30),
    userName: z.string().trim().min(1).max(30),
    timezone: z.string().trim().min(1).max(80),
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
