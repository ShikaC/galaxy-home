import { z } from "zod"
import { itemIdSchema, itemStatusSchema } from "./items.js"

const localDateSchema = z.iso.date()
const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const instantSchema = z.iso.datetime({ offset: true })
const timezoneSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
      return true
    } catch (error) {
      if (error instanceof RangeError) return false
      throw error
    }
  }, "时区无效")

export const workWindowRuleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: localTimeSchema,
    endTime: localTimeSchema,
  })
  .refine((value) => value.endTime > value.startTime, { message: "工作结束时间必须晚于开始时间" })
  .readonly()

export const defaultWorkWindow = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "18:00",
}))

const calendarQueryFields = {
  startDate: localDateSchema,
  endDate: localDateSchema,
  timezone: timezoneSchema,
  workWindow: z.array(workWindowRuleSchema).max(14).readonly().optional(),
} as const

export const calendarQuerySchema = z
  .object(calendarQueryFields)
  .refine((value) => value.endDate > value.startDate, { message: "日历结束日期必须晚于开始日期" })
  .readonly()

export type CalendarQuery = z.infer<typeof calendarQuerySchema>
export type WorkWindowRule = z.infer<typeof workWindowRuleSchema>

export const calendarItemSchema = z
  .object({
    id: itemIdSchema,
    title: z.string(),
    status: itemStatusSchema,
    version: z.number().int().positive(),
    dueAt: instantSchema.nullable(),
    dueDate: localDateSchema.nullable(),
    estimatedMinutes: z.number().int().positive().nullable(),
    scheduledStartAt: instantSchema.nullable(),
    scheduledEndAt: instantSchema.nullable(),
    scheduleTimezone: timezoneSchema.nullable(),
    isFixed: z.boolean(),
    dateAssignments: z.array(localDateSchema).readonly(),
    recurrenceSeriesId: z.uuid().nullable().optional(),
    recurrenceDate: localDateSchema.nullable().optional(),
  })
  .readonly()

export type CalendarItem = z.infer<typeof calendarItemSchema>

export const calendarSlotSchema = z
  .object({
    localDate: localDateSchema,
    startAt: instantSchema,
    endAt: instantSchema,
    minutes: z.number().int().nonnegative(),
  })
  .readonly()

export const calendarConflictCodeSchema = z.enum([
  "INVALID_INTERVAL",
  "OUTSIDE_RANGE",
  "OUTSIDE_WORK_WINDOW",
  "OVERLAP",
  "DEADLINE_EXCEEDED",
  "UNKNOWN_DURATION",
  "ITEM_NOT_FOUND",
  "VERSION_CONFLICT",
  "FIXED_ITEM",
  "COMPLETED_ITEM",
  "INSUFFICIENT_CAPACITY",
])

export const calendarConflictSchema = z
  .object({
    code: calendarConflictCodeSchema,
    severity: z.enum(["blocker", "warning"]),
    itemId: itemIdSchema.optional(),
    relatedItemId: itemIdSchema.optional(),
    localDate: localDateSchema.optional(),
    message: z.string(),
  })
  .readonly()

export const calendarSnapshotSchema = z
  .object({
    startDate: localDateSchema,
    endDate: localDateSchema,
    timezone: timezoneSchema,
    workWindow: z.array(workWindowRuleSchema).readonly(),
    items: z.array(calendarItemSchema).readonly(),
    scheduled: z.array(calendarItemSchema).readonly(),
    allDay: z.array(calendarItemSchema).readonly(),
    unscheduled: z.array(calendarItemSchema).readonly(),
    deadlines: z.array(calendarItemSchema).readonly(),
    freeSlots: z.array(calendarSlotSchema).readonly(),
    conflicts: z.array(calendarConflictSchema).readonly(),
    fingerprint: z.string().min(1),
  })
  .readonly()

export type CalendarSnapshot = z.infer<typeof calendarSnapshotSchema>
export type CalendarConflict = z.infer<typeof calendarConflictSchema>

export const scheduleChangeSchema = z
  .object({
    itemId: itemIdSchema,
    expectedVersion: z.number().int().positive(),
    scheduledStartAt: instantSchema,
    scheduledEndAt: instantSchema,
    scheduleTimezone: timezoneSchema,
  })
  .refine((value) => Date.parse(value.scheduledEndAt) > Date.parse(value.scheduledStartAt), {
    message: "安排结束时间必须晚于开始时间",
  })
  .readonly()

export const calendarValidateInputSchema = z
  .object({
    ...calendarQueryFields,
    changes: z.array(scheduleChangeSchema).min(1).max(200).readonly(),
  })
  .refine((value) => value.endDate > value.startDate, { message: "日历结束日期必须晚于开始日期" })

export type ScheduleChange = z.infer<typeof scheduleChangeSchema>
export type CalendarValidateInput = z.infer<typeof calendarValidateInputSchema>

export const calendarValidationResultSchema = z
  .object({
    valid: z.boolean(),
    blockers: z.array(calendarConflictSchema).readonly(),
    warnings: z.array(calendarConflictSchema).readonly(),
    freeSlots: z.array(calendarSlotSchema).readonly(),
    fingerprint: z.string().min(1),
  })
  .readonly()

export type CalendarValidationResult = z.infer<typeof calendarValidationResultSchema>
