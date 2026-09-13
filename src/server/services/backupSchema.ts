import { z } from "zod"

export const DATA_TABLES = [
  "workspace_settings",
  "workspace_notes",
  "plan_runs",
  "quotes",
  "daily_quote_selections",
  "categories",
  "items",
  "item_create_requests",
  "task_series",
  "task_occurrences",
  "task_reminder_rules",
  "task_plan_runs",
  "projects",
  "item_categories",
  "item_projects",
  "today_items",
  "project_stages",
  "project_tasks",
  "project_feedback",
  "project_ai_sessions",
  "habits",
  "habit_schedules",
  "habit_logs",
  "habit_exceptions",
  "daily_gains",
  "weekly_reviews",
  "review_suggestion_conversions",
  "ai_conversations",
  "ai_messages",
  "ai_memories",
  "ai_action_log",
  "item_ai_suggestions",
  "reminders",
  "notification_events",
  "notification_snooze_requests",
  "scheduler_state",
  "trash_entries",
  "tutorial_state",
] as const

export const DATA_TABLE_SET = new Set<string>(DATA_TABLES)

export const exportSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string(),
  tables: z.record(
    z.string(),
    z.array(z.record(z.string(), z.union([z.string(), z.number(), z.bigint(), z.null()]))),
  ),
})
