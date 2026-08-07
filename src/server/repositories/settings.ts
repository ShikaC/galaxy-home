import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { UpdateSettingsInput } from "../../shared/app.js"
import { type WorkspaceSettings, workspaceSettingsSchema } from "../../shared/settings.js"

const settingsRowSchema = z.object({
  workspace_name: z.string(),
  ai_nickname: z.string(),
  user_name: z.string(),
  timezone: z.string(),
  ai_permission: z.enum(["conservative", "open"]),
  ai_personality_prompt: z.string(),
  onboarding_completed: z.number().int(),
  backup_retention_days: z.number().int(),
  trash_retention_days: z.number().int(),
  morning_reminder_time: z.string(),
  morning_reminder_enabled: z.number().int(),
  evening_reminder_time: z.string(),
  evening_reminder_enabled: z.number().int(),
  weekly_review_time: z.string(),
  weekly_review_enabled: z.number().int(),
})

export function getSettings(database: DatabaseSync): WorkspaceSettings {
  const row = settingsRowSchema.parse(
    database.prepare("SELECT * FROM workspace_settings WHERE id = 1").get(),
  )
  return workspaceSettingsSchema.parse({
    workspaceName: row.workspace_name,
    aiNickname: row.ai_nickname,
    userName: row.user_name,
    timezone: row.timezone,
    aiPermission: row.ai_permission,
    aiPersonalityPrompt: row.ai_personality_prompt,
    onboardingCompleted: row.onboarding_completed === 1,
    backupRetentionDays: row.backup_retention_days,
    trashRetentionDays: row.trash_retention_days,
    morningReminderTime: row.morning_reminder_time,
    morningReminderEnabled: row.morning_reminder_enabled === 1,
    eveningReminderTime: row.evening_reminder_time,
    eveningReminderEnabled: row.evening_reminder_enabled === 1,
    weeklyReviewTime: row.weekly_review_time,
    weeklyReviewEnabled: row.weekly_review_enabled === 1,
  })
}

export function updateSettings(
  database: DatabaseSync,
  input: UpdateSettingsInput,
): WorkspaceSettings {
  const current = getSettings(database)
  database
    .prepare(
      `UPDATE workspace_settings SET workspace_name = ?, ai_nickname = ?, user_name = ?, timezone = ?,
     ai_permission = ?, ai_personality_prompt = ?, backup_retention_days = ?, trash_retention_days = ?,
     morning_reminder_time = ?, morning_reminder_enabled = ?, evening_reminder_time = ?,
     evening_reminder_enabled = ?, weekly_review_time = ?, weekly_review_enabled = ?, updated_at = ? WHERE id = 1`,
    )
    .run(
      input.workspaceName ?? current.workspaceName,
      input.aiNickname ?? current.aiNickname,
      input.userName ?? current.userName,
      input.timezone ?? current.timezone,
      input.aiPermission ?? current.aiPermission,
      input.aiPersonalityPrompt ?? current.aiPersonalityPrompt,
      input.backupRetentionDays ?? current.backupRetentionDays,
      input.trashRetentionDays ?? current.trashRetentionDays,
      input.morningReminderTime ?? current.morningReminderTime,
      Number(input.morningReminderEnabled ?? current.morningReminderEnabled),
      input.eveningReminderTime ?? current.eveningReminderTime,
      Number(input.eveningReminderEnabled ?? current.eveningReminderEnabled),
      input.weeklyReviewTime ?? current.weeklyReviewTime,
      Number(input.weeklyReviewEnabled ?? current.weeklyReviewEnabled),
      new Date().toISOString(),
    )
  return getSettings(database)
}
