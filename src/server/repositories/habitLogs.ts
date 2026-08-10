import type { DatabaseSync } from "node:sqlite"
import { parseISO } from "date-fns"
import { z } from "zod"
import {
  habitIdSchema,
  habitTypeSchema,
  type SetHabitLogInput,
  setHabitLogInputSchema,
} from "../../shared/habits.js"

const habitKindRowSchema = z.object({
  type: habitTypeSchema,
  rest_days_json: z.string(),
})

export class HabitRestDayError extends Error {
  readonly name = "HabitRestDayError"

  constructor() {
    super("今天是该习惯的休息日，如需补记请使用历史修正")
  }
}

function restDaysFor(database: DatabaseSync, habitId: string): readonly number[] {
  const habit = habitKindRowSchema.parse(
    database
      .prepare("SELECT type, rest_days_json FROM habits WHERE id = ? AND deleted_at IS NULL")
      .get(habitId),
  )
  return z.array(z.number().int().min(0).max(6)).parse(JSON.parse(habit.rest_days_json))
}

function assertNotRestDay(database: DatabaseSync, habitId: string, localDate: string): void {
  const restDays = restDaysFor(database, habitId)
  if (restDays.includes(parseISO(localDate).getDay())) throw new HabitRestDayError()
}

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
  assertNotRestDay(database, habitId, localDate)
  const habit = habitKindRowSchema.parse(
    database
      .prepare("SELECT type, rest_days_json FROM habits WHERE id = ? AND deleted_at IS NULL")
      .get(habitId),
  )
  const current = database
    .prepare("SELECT count FROM habit_logs WHERE habit_id = ? AND local_date = ?")
    .get(habitId, localDate) as { count?: number } | undefined
  const currentCount = Number(current?.count ?? 0)
  writeLog(database, habitId, localDate, habit.type === "check" ? 1 : currentCount + 1, false)
}

export function undoHabit(database: DatabaseSync, rawHabitId: string, localDate: string): void {
  const habitId = habitIdSchema.parse(rawHabitId)
  assertNotRestDay(database, habitId, localDate)
  const current = database
    .prepare("SELECT count FROM habit_logs WHERE habit_id = ? AND local_date = ?")
    .get(habitId, localDate) as { count?: number } | undefined
  const currentCount = Number(current?.count ?? 0)
  writeLog(database, habitId, localDate, Math.max(0, currentCount - 1), false)
}

export function setHabitLog(database: DatabaseSync, rawInput: SetHabitLogInput): void {
  const input = setHabitLogInputSchema.parse(rawInput)
  if (input.status === "active" && !input.corrected) {
    assertNotRestDay(database, input.habitId, input.localDate)
  }
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
