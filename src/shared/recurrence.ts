import { z } from "zod"

const validLocalDate = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(validLocalDate, "日期无效")
export const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const untilDateSchema = localDateSchema.nullable().optional()

export const recurrenceRuleSchema = z.discriminatedUnion("frequency", [
  z
    .object({
      frequency: z.literal("daily"),
      interval: z.number().int().positive().max(365),
      untilDate: untilDateSchema,
    })
    .readonly(),
  z
    .object({
      frequency: z.literal("weekly"),
      interval: z.number().int().positive().max(52),
      weekdays: z
        .array(z.number().int().min(1).max(7))
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length, "星期不可重复")
        .readonly(),
      untilDate: untilDateSchema,
    })
    .readonly(),
  z
    .object({
      frequency: z.literal("monthly"),
      interval: z.number().int().positive().max(120),
      dayOfMonth: z.number().int().min(1).max(31),
      untilDate: untilDateSchema,
    })
    .readonly(),
])

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>

const prioritySchema = z.enum(["none", "low", "medium", "high"])
const idSchema = z.string().uuid()
const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format()
      return true
    } catch {
      return false
    }
  }, "时区无效")
export const recurrenceReminderInputSchema = z
  .object({
    anchor: z.enum(["due", "scheduled"]),
    offsetMinutes: z.number().int().nonnegative(),
  })
  .readonly()
const recurrenceRemindersSchema = z
  .array(recurrenceReminderInputSchema)
  .max(20)
  .refine(
    (rules) =>
      new Set(rules.map((rule) => `${rule.anchor}:${rule.offsetMinutes}`)).size === rules.length,
    "重复提醒规则不可重复",
  )
  .readonly()

const taskSeriesTemplateSchema = z.object({
  requestId: idSchema,
  title: z.string().trim().min(1).max(240),
  notes: z.string().trim().max(10_000).nullable().optional(),
  priority: prioritySchema.default("none"),
  categoryIds: z.array(idSchema).max(20).default([]).readonly(),
  projectIds: z.array(idSchema).max(20).default([]).readonly(),
  timezone: timezoneSchema,
  startDate: localDateSchema,
  rule: recurrenceRuleSchema,
  estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  dueTime: localTimeSchema.nullable().optional(),
  reminderMinutes: z.number().int().nonnegative().nullable().optional(),
  reminders: recurrenceRemindersSchema.default([]),
})

export const createTaskSeriesInputSchema = taskSeriesTemplateSchema
  .refine((value) => value.dueTime != null || value.reminderMinutes == null, {
    message: "没有本地截止时间时不能设置提醒",
    path: ["reminderMinutes"],
  })
  .refine(
    (value) => value.reminders.every((rule) => rule.anchor === "due" && value.dueTime != null),
    { message: "重复系列目前只支持有本地截止时间的截止提醒", path: ["reminders"] },
  )
  .readonly()

export type CreateTaskSeriesInput = z.infer<typeof createTaskSeriesInputSchema>
export type CreateTaskSeriesInputValue = z.input<typeof createTaskSeriesInputSchema>

export const updateTaskSeriesInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(240).optional(),
    notes: z.string().trim().max(10_000).nullable().optional(),
    priority: prioritySchema.optional(),
    categoryIds: z.array(idSchema).max(20).readonly().optional(),
    projectIds: z.array(idSchema).max(20).readonly().optional(),
    timezone: timezoneSchema.optional(),
    rule: recurrenceRuleSchema.optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    dueTime: localTimeSchema.nullable().optional(),
    reminderMinutes: z.number().int().nonnegative().nullable().optional(),
    reminders: recurrenceRemindersSchema.optional(),
    status: z.enum(["active", "paused"]).optional(),
  })
  .refine((value) => value.dueTime !== null || value.reminderMinutes == null, {
    message: "没有本地截止时间时不能设置提醒",
    path: ["reminderMinutes"],
  })
  .refine((value) => value.reminders?.every((rule) => rule.anchor === "due") ?? true, {
    message: "重复系列目前只支持截止提醒",
    path: ["reminders"],
  })
  .readonly()

export type UpdateTaskSeriesInput = z.infer<typeof updateTaskSeriesInputSchema>

export const recurrenceMaterializationErrorSchema = z
  .object({
    reason: z.enum(["nonexistent", "ambiguous"]),
    localDate: localDateSchema,
    localTime: localTimeSchema,
    timezone: timezoneSchema,
    occurredAt: z.string(),
  })
  .readonly()

export const taskSeriesSchema = z
  .object({
    id: idSchema,
    version: z.number().int().positive(),
    title: z.string(),
    notes: z.string().nullable(),
    priority: prioritySchema,
    categoryIds: z.array(idSchema).readonly(),
    projectIds: z.array(idSchema).readonly(),
    timezone: timezoneSchema,
    startDate: localDateSchema,
    rule: recurrenceRuleSchema,
    estimatedMinutes: z.number().int().nullable(),
    dueTime: localTimeSchema.nullable(),
    reminderMinutes: z.number().int().nonnegative().nullable(),
    reminders: recurrenceRemindersSchema,
    status: z.enum(["active", "paused"]),
    materializedThroughDate: localDateSchema.nullable(),
    materializationError: recurrenceMaterializationErrorSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .readonly()

export type TaskSeries = z.infer<typeof taskSeriesSchema>

export const materializeTaskSeriesInputSchema = z
  .object({
    requestId: idSchema,
    fromDate: localDateSchema,
    toDate: localDateSchema,
  })
  .refine((value) => value.fromDate <= value.toDate, "物化结束日期不能早于开始日期")
  .refine(
    (value) =>
      new Date(`${value.toDate}T00:00:00.000Z`).getTime() -
        new Date(`${value.fromDate}T00:00:00.000Z`).getTime() <=
      366 * 86_400_000,
    "单次最多物化 366 天",
  )
  .readonly()

export const skipOccurrenceInputSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .readonly()

export {
  localOccurrenceInstant,
  nextOccurrenceDate,
  occurrenceDates,
  RecurrenceLocalTimeError,
} from "./recurrenceCalendar.js"
