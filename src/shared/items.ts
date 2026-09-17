import { z } from "zod"
import {
  calendarDateSchema,
  ianaTimezoneSchema,
  offsetDateTimeSchema,
  reminderRuleInputsSchema,
  reminderRuleSchema,
  scheduleFieldsSchema,
  taskPrioritySchema,
} from "./taskCore.js"

export const itemIdSchema = z.uuid().brand("ItemId")
export const categoryIdSchema = z.uuid().brand("CategoryId")
export const projectIdSchema = z.uuid().brand("ProjectId")
export const itemStatusSchema = z.enum(["active", "completed", "archived"])

const todayPlacementSchema = z
  .object({
    localDate: calendarDateSchema,
    isFocus: z.boolean(),
    isSecondary: z.boolean(),
  })
  .refine((value) => !(value.isFocus && value.isSecondary), "稍后任务不能同时设为重点")
  .readonly()

export const createItemInputSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    notes: z.string().trim().max(10_000).optional(),
    dueAt: offsetDateTimeSchema.optional(),
    dueDate: calendarDateSchema.optional(),
    reminderMinutes: z.number().int().nonnegative().optional(),
    reminders: reminderRuleInputsSchema.optional(),
    priority: taskPrioritySchema.default("none"),
    parentId: itemIdSchema.optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).optional(),
    scheduledStartAt: offsetDateTimeSchema.optional(),
    scheduledEndAt: offsetDateTimeSchema.optional(),
    scheduleTimezone: ianaTimezoneSchema.optional(),
    isFixed: z.boolean().default(false),
    categoryIds: z.array(categoryIdSchema).max(20).default([]),
    projectIds: z.array(projectIdSchema).max(20).default([]),
    requestId: z.uuid().optional(),
    today: todayPlacementSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.dueAt !== undefined && value.dueDate !== undefined)
      context.addIssue({ code: "custom", message: "时间截止和日期截止不能同时设置" })
    if (value.reminderMinutes !== undefined && value.dueAt === undefined)
      context.addIssue({ code: "custom", message: "没有时间截止时不能设置旧版提醒" })
    const schedule = scheduleFieldsSchema.safeParse({
      scheduledStartAt: value.scheduledStartAt ?? null,
      scheduledEndAt: value.scheduledEndAt ?? null,
      scheduleTimezone: value.scheduleTimezone ?? null,
      isFixed: value.isFixed,
    })
    if (!schedule.success)
      for (const issue of schedule.error.issues)
        context.addIssue({ code: "custom", path: issue.path, message: issue.message })
    for (const rule of value.reminders ?? []) {
      if (rule.anchor === "due" && value.dueAt === undefined)
        context.addIssue({ code: "custom", message: "截止提醒需要时间截止" })
      if (rule.anchor === "scheduled" && value.scheduledStartAt === undefined)
        context.addIssue({ code: "custom", message: "安排提醒需要安排时段" })
    }
  })
  .readonly()
export type CreateItemInput = z.input<typeof createItemInputSchema>
export type ParsedCreateItemInput = z.infer<typeof createItemInputSchema>

export const updateItemInputSchema = z
  .object({
    expectedVersion: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(240).optional(),
    notes: z.string().trim().max(10_000).nullable().optional(),
    dueAt: offsetDateTimeSchema.nullable().optional(),
    dueDate: calendarDateSchema.nullable().optional(),
    reminderMinutes: z.number().int().nonnegative().nullable().optional(),
    reminders: reminderRuleInputsSchema.optional(),
    priority: taskPrioritySchema.optional(),
    parentId: itemIdSchema.nullable().optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    scheduledStartAt: offsetDateTimeSchema.nullable().optional(),
    scheduledEndAt: offsetDateTimeSchema.nullable().optional(),
    scheduleTimezone: ianaTimezoneSchema.nullable().optional(),
    isFixed: z.boolean().optional(),
    status: itemStatusSchema.optional(),
    categoryIds: z.array(categoryIdSchema).max(20).optional(),
    projectIds: z.array(projectIdSchema).max(20).optional(),
  })
  .readonly()
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>

export const itemSchema = z
  .object({
    id: itemIdSchema,
    version: z.number().int().positive(),
    title: z.string(),
    notes: z.string().nullable(),
    priority: taskPrioritySchema,
    parentId: itemIdSchema.nullable(),
    dueAt: z.string().nullable(),
    dueDate: z.string().nullable(),
    estimatedMinutes: z.number().int().nullable(),
    scheduledStartAt: z.string().nullable(),
    scheduledEndAt: z.string().nullable(),
    scheduleTimezone: z.string().nullable(),
    isFixed: z.boolean(),
    reminderMinutes: z.number().int().nullable(),
    reminders: z.array(reminderRuleSchema).readonly(),
    status: itemStatusSchema,
    completedAt: z.string().nullable(),
    categoryIds: z.array(categoryIdSchema).readonly(),
    projectIds: z.array(projectIdSchema).readonly(),
    recurrenceSeriesId: z.uuid().nullable(),
    recurrenceDate: z.string().nullable(),
    recurrenceStatus: z.enum(["active", "skipped"]).nullable(),
    subtaskCount: z.number().int().nonnegative(),
    completedSubtaskCount: z.number().int().nonnegative(),
    isTutorial: z.boolean(),
    inToday: z.boolean(),
    isFocus: z.boolean(),
    isSecondary: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .readonly()
export type Item = z.infer<typeof itemSchema>

export const itemDetailSchema = itemSchema
  .unwrap()
  .extend({ subtasks: z.array(itemSchema).readonly() })
  .readonly()
export type ItemDetail = z.infer<typeof itemDetailSchema>

export const itemViewSchema = z.enum(["inbox", "today", "active", "completed", "archived"])
export type ItemQuery = {
  readonly view: z.infer<typeof itemViewSchema>
  readonly localDate: string
  readonly categoryId?: z.infer<typeof categoryIdSchema>
  readonly projectId?: z.infer<typeof projectIdSchema>
  readonly timezone?: string
}

export type TodayItemInput = {
  readonly itemId: z.infer<typeof itemIdSchema>
  readonly localDate: string
  readonly expectedVersion?: number
} & (
  | { readonly isFocus: boolean; readonly isSecondary: false }
  | { readonly isFocus: false; readonly isSecondary: true }
)

export const createCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icon: z.string().trim().min(1).max(40),
  })
  .readonly()
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>

export const categorySchema = z
  .object({
    id: categoryIdSchema,
    name: z.string(),
    color: z.string(),
    icon: z.string(),
    sortOrder: z.number().int(),
  })
  .readonly()
export type Category = z.infer<typeof categorySchema>
