import type { DatabaseSync, SQLOutputValue } from "node:sqlite"
import { format, parseISO, startOfWeek } from "date-fns"
import { z } from "zod"
import {
  type Habit,
  habitFrequencySchema,
  habitIdSchema,
  habitSchema,
  habitTypeSchema,
} from "../../shared/habits.js"
import {
  calculateHabitStreak,
  countHabitCheckIns,
  countHabitCheckInsInRange,
} from "./habitStats.js"

const habitRowSchema = z.object({
  id: habitIdSchema,
  name: z.string(),
  type: habitTypeSchema,
  target_count: z.number().int(),
  frequency_type: habitFrequencySchema,
  weekly_target: z.number().int().nullable(),
  rest_days_json: z.string(),
  is_tutorial: z.number().int(),
  created_at: z.string(),
})

const currentLogSchema = z
  .object({
    count: z.number().int(),
    status: z.enum(["active", "leave"]),
    corrected: z.number().int(),
  })
  .optional()

export function readHabit(
  database: DatabaseSync,
  row: Record<string, SQLOutputValue>,
  localDate: string,
): Habit {
  const parsed = habitRowSchema.parse(row)
  const restDays = z.array(z.number().int().min(0).max(6)).parse(JSON.parse(parsed.rest_days_json))
  const log = currentLogSchema.parse(
    database
      .prepare(
        "SELECT count, status, corrected FROM habit_logs WHERE habit_id = ? AND local_date = ?",
      )
      .get(parsed.id, localDate),
  )
  const currentCount = log?.status === "active" ? log.count : 0
  const tutorial = parsed.is_tutorial === 1
  const localDay = parseISO(localDate)
  const weekStart = format(startOfWeek(localDay, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const weeklyCount = tutorial
    ? 0
    : countHabitCheckInsInRange(database, parsed.id, parsed.target_count, weekStart, localDate)
  const isRestDay = restDays.includes(localDay.getDay())
  const scheduledToday =
    !isRestDay &&
    log?.status !== "leave" &&
    (parsed.frequency_type === "daily" ||
      weeklyCount < (parsed.weekly_target ?? 1) ||
      currentCount > 0)

  return habitSchema.parse({
    id: parsed.id,
    name: parsed.name,
    type: parsed.type,
    targetCount: parsed.target_count,
    frequencyType: parsed.frequency_type,
    weeklyTarget: parsed.weekly_target,
    restDays,
    currentCount,
    completedToday: currentCount >= parsed.target_count,
    todayStatus: log?.status ?? null,
    correctedToday: log?.corrected === 1,
    isRestDay,
    scheduledToday,
    weeklyCount,
    streak: tutorial
      ? 0
      : calculateHabitStreak(database, parsed.id, localDate, parsed.target_count, restDays),
    totalCheckIns: tutorial ? 0 : countHabitCheckIns(database, parsed.id, parsed.target_count),
    isTutorial: tutorial,
    createdAt: parsed.created_at,
  })
}

export function readHabitRows(
  database: DatabaseSync,
  rows: readonly Record<string, SQLOutputValue>[],
  localDate: string,
): readonly Habit[] {
  return rows.map((row) => readHabit(database, row, localDate))
}
