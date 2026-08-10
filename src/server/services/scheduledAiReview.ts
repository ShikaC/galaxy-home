import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { getSettings } from "../repositories/settings.js"
import { generateAiWeeklyReview } from "./aiReview.js"
import { dueWeeklyReviewWindow } from "./scheduler.js"
import { getAiConfigStatus } from "./secrets.js"

export async function maybeGenerateScheduledAiWeeklyReview(
  database: DatabaseSync,
  secretPath: string,
  now = new Date(),
): Promise<void> {
  const settings = getSettings(database)
  if (settings.aiPermission !== "open") return
  if (!getAiConfigStatus(secretPath).configured) return
  const window = dueWeeklyReviewWindow(database, now)
  if (window === null) return
  const existing = z
    .object({ value: z.number() })
    .parse(
      database
        .prepare(
          "SELECT COUNT(*) AS value FROM weekly_reviews WHERE week_start = ? AND deleted_at IS NULL",
        )
        .get(window.weekStart),
    ).value
  if (existing > 0) return
  await generateAiWeeklyReview(database, secretPath, window.weekStart, window.weekEnd, true)
}
