import { z } from "zod"

export const habitIdSchema = z.string().uuid().brand("HabitId")
export const habitTypeSchema = z.enum(["check", "count"])
export const habitFrequencySchema = z.enum(["daily", "weekly"])
export const habitLogStatusSchema = z.enum(["active", "leave"])

export const createHabitInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: habitTypeSchema,
    targetCount: z.number().int().min(1).max(999),
    frequencyType: habitFrequencySchema,
    weeklyTarget: z.number().int().min(1).max(7).nullable(),
    restDays: z.array(z.number().int().min(0).max(6)).max(7),
  })
  .refine((value) => value.frequencyType === "weekly" || value.weeklyTarget === null, {
    path: ["weeklyTarget"],
    message: "每日习惯不使用每周目标",
  })
  .readonly()

export type CreateHabitInput = z.infer<typeof createHabitInputSchema>
export const updateHabitInputSchema = createHabitInputSchema
export type UpdateHabitInput = z.infer<typeof updateHabitInputSchema>

export const habitSchema = z
  .object({
    id: habitIdSchema,
    name: z.string(),
    type: habitTypeSchema,
    targetCount: z.number().int(),
    frequencyType: habitFrequencySchema,
    weeklyTarget: z.number().int().nullable(),
    restDays: z.array(z.number().int()).readonly(),
    currentCount: z.number().int(),
    completedToday: z.boolean(),
    todayStatus: habitLogStatusSchema.nullable(),
    correctedToday: z.boolean(),
    isRestDay: z.boolean(),
    scheduledToday: z.boolean(),
    weeklyCount: z.number().int().nonnegative(),
    streak: z.number().int(),
    totalCheckIns: z.number().int(),
    isTutorial: z.boolean(),
    createdAt: z.string(),
  })
  .readonly()

export type Habit = z.infer<typeof habitSchema>

export const setHabitLogInputSchema = z
  .object({
    habitId: habitIdSchema,
    localDate: z.iso.date(),
    count: z.number().int().nonnegative(),
    status: habitLogStatusSchema,
    corrected: z.boolean(),
  })
  .readonly()

export type SetHabitLogInput = z.infer<typeof setHabitLogInputSchema>

export const habitDaySummarySchema = z
  .object({ localDate: z.iso.date(), completedHabits: z.number().int().nonnegative() })
  .readonly()
