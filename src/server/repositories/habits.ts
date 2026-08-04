import type { DatabaseSync } from "node:sqlite"
import { type CreateHabitInput, type Habit, habitIdSchema } from "../../shared/habits.js"
import { readHabitRows } from "./habitRows.js"

export { recordHabit, setHabitLog, undoHabit } from "./habitLogs.js"

export function createHabit(database: DatabaseSync, input: CreateHabitInput): Habit {
  const id = habitIdSchema.parse(crypto.randomUUID())
  const now = new Date().toISOString()
  const nextOrder = database
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM habits")
    .get()
  const order = Number(nextOrder?.["value"] ?? 0)

  database
    .prepare(
      `INSERT INTO habits
       (id, name, type, target_count, frequency_type, weekly_target, rest_days_json,
        sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.type,
      input.targetCount,
      input.frequencyType,
      input.weeklyTarget,
      JSON.stringify(input.restDays),
      order,
      now,
      now,
    )
  const created = listHabits(database, now.slice(0, 10)).find((habit) => habit.id === id)
  if (created === undefined) {
    throw new Error(`Created habit could not be read: ${id}`)
  }
  return created
}

export function listHabits(database: DatabaseSync, localDate: string): readonly Habit[] {
  return readHabitRows(
    database,
    database
      .prepare(
        `SELECT * FROM habits
         WHERE active = 1 AND deleted_at IS NULL
         ORDER BY sort_order, created_at`,
      )
      .all(),
    localDate,
  )
}

export function listHabitDaySummaries(database: DatabaseSync, startDate: string, endDate: string) {
  return database
    .prepare(
      `SELECT habit_logs.local_date AS localDate, COUNT(*) AS completedHabits
       FROM habit_logs JOIN habits ON habits.id = habit_logs.habit_id
       WHERE habit_logs.local_date BETWEEN ? AND ? AND habit_logs.status = 'active'
         AND habit_logs.count >= habits.target_count AND habits.is_tutorial = 0
       GROUP BY habit_logs.local_date ORDER BY habit_logs.local_date`,
    )
    .all(startDate, endDate)
}
