import { z } from "zod"

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [yearText, monthText, dayText] = value.split("-")
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, "日期无效")

export const offsetDateTimeSchema = z.iso.datetime({ offset: true })

export const ianaTimezoneSchema = z
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

// 未估时任务在排期与容量计算中的默认占用。对标滴答清单的「默认任务时长」：
// 用户不必手填数字，拖到日历就得到这个长度，之后可拖动调整。
export const DEFAULT_TASK_MINUTES = 30
export const taskPrioritySchema = z.enum(["none", "low", "medium", "high"])
export const reminderAnchorSchema = z.enum(["due", "scheduled"])

const reminderRuleInputFields = {
  anchor: reminderAnchorSchema,
  offsetMinutes: z.number().int().nonnegative(),
} as const

export const reminderRuleInputSchema = z.object(reminderRuleInputFields).readonly()

export const reminderRuleSchema = z
  .object({
    ...reminderRuleInputFields,
    id: z.string().min(1),
    version: z.number().int().positive(),
    enabled: z.boolean(),
  })
  .readonly()

export const reminderRuleInputsSchema = z
  .array(reminderRuleInputSchema)
  .max(20)
  .refine(
    (rules) =>
      new Set(rules.map((rule) => `${rule.anchor}:${rule.offsetMinutes}`)).size === rules.length,
    "不能添加重复提醒",
  )
  .readonly()

export const scheduleFieldsSchema = z
  .object({
    scheduledStartAt: offsetDateTimeSchema.nullable(),
    scheduledEndAt: offsetDateTimeSchema.nullable(),
    scheduleTimezone: ianaTimezoneSchema.nullable(),
    isFixed: z.boolean(),
  })
  .superRefine((value, context) => {
    const populated = [
      value.scheduledStartAt !== null,
      value.scheduledEndAt !== null,
      value.scheduleTimezone !== null,
    ]
    if (populated.some(Boolean) && !populated.every(Boolean)) {
      context.addIssue({ code: "custom", message: "安排开始、结束和时区必须同时设置" })
      return
    }
    if (
      value.scheduledStartAt !== null &&
      value.scheduledEndAt !== null &&
      Date.parse(value.scheduledEndAt) <= Date.parse(value.scheduledStartAt)
    ) {
      context.addIssue({ code: "custom", message: "安排结束时间必须晚于开始时间" })
    }
    if (value.isFixed && value.scheduledStartAt === null) {
      context.addIssue({ code: "custom", message: "固定任务必须先设置安排时段" })
    }
  })
  .readonly()
