import type { DatabaseSync } from "node:sqlite"
import {
  type CreateHabitInput,
  type Habit,
  habitIdSchema,
  type UpdateHabitInput,
} from "../../shared/habits.js"
import { readHabit, readHabitRows } from "./habitRows.js"

export { recordHabit, setHabitLog, undoHabit } from "./habitLogs.js"

export class HabitNotFoundError extends Error {
  readonly name = "HabitNotFoundError"

  constructor(readonly habitId: string) {
    super(`Habit not found: ${habitId}`)
  }
}

export function getHabit(database: DatabaseSync, habitId: string, localDate: string): Habit {
  const row = database
    .prepare("SELECT * FROM habits WHERE id = ? AND deleted_at IS NULL")
    .get(habitId)
  if (row === undefined) throw new HabitNotFoundError(habitId)
  return readHabit(database, row, localDate)
}

export function createHabit(
  database: DatabaseSync,
  input: CreateHabitInput,
  localDate = new Date().toISOString().slice(0, 10),
): Habit {
  const id = habitIdSchema.parse(crypto.randomUUID())
  const now = new Date().toISOString()
  const nextOrder = database
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM habits")
    .get() as { value?: number } | undefined
  const order = Number(nextOrder?.value ?? 0)

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
  const created = listHabits(database, localDate).find((habit) => habit.id === id)
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

export function updateHabit(
  database: DatabaseSync,
  rawHabitId: string,
  input: UpdateHabitInput,
  localDate = new Date().toISOString().slice(0, 10),
): Habit {
  const habitId = habitIdSchema.parse(rawHabitId)
  const now = new Date().toISOString()
  const result = database
    .prepare(
      `UPDATE habits SET name = ?, type = ?, target_count = ?, frequency_type = ?,
       weekly_target = ?, rest_days_json = ?, is_tutorial = 0, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(
      input.name,
      input.type,
      input.targetCount,
      input.frequencyType,
      input.weeklyTarget,
      JSON.stringify(input.restDays),
      now,
      habitId,
    )
  if (result.changes === 0) throw new HabitNotFoundError(habitId)
  return getHabit(database, habitId, localDate)
}

export function copyHabit(
  database: DatabaseSync,
  rawHabitId: string,
  localDate = new Date().toISOString().slice(0, 10),
): Habit {
  const source = getHabit(database, habitIdSchema.parse(rawHabitId), localDate)
  return createHabit(
    database,
    {
      name: `${source.name} 副本`,
      type: source.type,
      targetCount: source.targetCount,
      frequencyType: source.frequencyType,
      weeklyTarget: source.weeklyTarget,
      restDays: [...source.restDays],
    },
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
         AND habits.deleted_at IS NULL
       GROUP BY habit_logs.local_date ORDER BY habit_logs.local_date`,
    )
    .all(startDate, endDate)
}
