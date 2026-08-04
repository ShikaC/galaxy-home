import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  habitIdSchema,
  habitTypeSchema,
  type SetHabitLogInput,
  setHabitLogInputSchema,
} from "../../shared/habits.js"

const habitKindRowSchema = z.object({ type: habitTypeSchema })

function writeLog(
  database: DatabaseSync,
  habitId: string,
  localDate: string,
  count: number,
  corrected: boolean,
): void {
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO habit_logs
       (id, habit_id, local_date, count, status, corrected, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(habit_id, local_date) DO UPDATE SET
         count = excluded.count, status = 'active', corrected = excluded.corrected,
         updated_at = excluded.updated_at`,
    )
    .run(crypto.randomUUID(), habitId, localDate, count, corrected ? 1 : 0, now, now)
}

export function recordHabit(database: DatabaseSync, rawHabitId: string, localDate: string): void {
  const habitId = habitIdSchema.parse(rawHabitId)
  const habit = habitKindRowSchema.parse(
    database.prepare("SELECT type FROM habits WHERE id = ? AND deleted_at IS NULL").get(habitId),
  )
  const current = database
    .prepare("SELECT count FROM habit_logs WHERE habit_id = ? AND local_date = ?")
    .get(habitId, localDate)
  const currentCount = Number(current?.["count"] ?? 0)
  writeLog(database, habitId, localDate, habit.type === "check" ? 1 : currentCount + 1, false)
}

export function undoHabit(database: DatabaseSync, rawHabitId: string, localDate: string): void {
  const habitId = habitIdSchema.parse(rawHabitId)
  const current = database
    .prepare("SELECT count FROM habit_logs WHERE habit_id = ? AND local_date = ?")
    .get(habitId, localDate)
  const currentCount = Number(current?.["count"] ?? 0)
  writeLog(database, habitId, localDate, Math.max(0, currentCount - 1), false)
}

export function setHabitLog(database: DatabaseSync, rawInput: SetHabitLogInput): void {
  const input = setHabitLogInputSchema.parse(rawInput)
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO habit_logs
       (id, habit_id, local_date, count, status, corrected, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(habit_id, local_date) DO UPDATE SET
         count = excluded.count, status = excluded.status, corrected = excluded.corrected,
         updated_at = excluded.updated_at`,
    )
    .run(
      crypto.randomUUID(),
      input.habitId,
      input.localDate,
      input.count,
      input.status,
      input.corrected ? 1 : 0,
      now,
      now,
    )
}
