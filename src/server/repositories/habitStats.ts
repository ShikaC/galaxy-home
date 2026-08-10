import type { DatabaseSync } from "node:sqlite"
import { format, getDay, parseISO, subDays } from "date-fns"
import { z } from "zod"

const logRowSchema = z
  .object({ count: z.number().int(), status: z.enum(["active", "leave"]) })
  .optional()

export function countHabitCheckIns(
  database: DatabaseSync,
  habitId: string,
  targetCount: number,
): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS value FROM habit_logs
       WHERE habit_id = ? AND status = 'active' AND count >= ?`,
    )
    .get(habitId, targetCount) as { value?: number } | undefined
  return Number(row?.value ?? 0)
}

export function countHabitCheckInsInRange(
  database: DatabaseSync,
  habitId: string,
  targetCount: number,
  startDate: string,
  endDate: string,
): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS value FROM habit_logs
       WHERE habit_id = ? AND status = 'active' AND count >= ?
         AND local_date BETWEEN ? AND ?`,
    )
    .get(habitId, targetCount, startDate, endDate) as { value?: number } | undefined
  return Number(row?.value ?? 0)
}

export function calculateHabitStreak(
  database: DatabaseSync,
  habitId: string,
  localDate: string,
  targetCount: number,
  restDays: readonly number[],
): number {
  let cursor = parseISO(localDate)
  let streak = 0
  for (let checkedDays = 0; checkedDays < 3_650; checkedDays += 1) {
    const date = format(cursor, "yyyy-MM-dd")
    const log = logRowSchema.parse(
      database
        .prepare("SELECT count, status FROM habit_logs WHERE habit_id = ? AND local_date = ?")
        .get(habitId, date),
    )
    if (restDays.includes(getDay(cursor)) || log?.status === "leave") {
      cursor = subDays(cursor, 1)
      continue
    }
    if (log !== undefined && log.count >= targetCount) {
      streak += 1
      cursor = subDays(cursor, 1)
      continue
    }
    break
  }
  return streak
}
