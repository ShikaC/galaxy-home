import { z } from "zod"

export const itemIdSchema = z.string().uuid().brand("ItemId")
export const categoryIdSchema = z.string().uuid().brand("CategoryId")
export const projectIdSchema = z.string().uuid().brand("ProjectId")
export const itemStatusSchema = z.enum(["active", "completed", "archived"])

export const createItemInputSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    notes: z.string().trim().max(10_000).optional(),
    dueAt: z.iso.datetime().optional(),
    reminderMinutes: z.number().int().nonnegative().optional(),
    categoryIds: z.array(categoryIdSchema).max(20).default([]),
    projectIds: z.array(projectIdSchema).max(20).default([]),
  })
  .refine((value) => value.dueAt !== undefined || value.reminderMinutes === undefined, {
    message: "没有截止时间时不能设置提醒",
    path: ["reminderMinutes"],
  })
  .readonly()

export type CreateItemInput = z.infer<typeof createItemInputSchema>

export const updateItemInputSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    notes: z.string().trim().max(10_000).nullable().optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    reminderMinutes: z.number().int().nonnegative().nullable().optional(),
    status: itemStatusSchema.optional(),
  })
  .readonly()

export type UpdateItemInput = z.infer<typeof updateItemInputSchema>

export const itemSchema = z
  .object({
    id: itemIdSchema,
    title: z.string(),
    notes: z.string().nullable(),
    dueAt: z.string().nullable(),
    reminderMinutes: z.number().int().nullable(),
    status: itemStatusSchema,
    completedAt: z.string().nullable(),
    categoryIds: z.array(categoryIdSchema).readonly(),
    projectIds: z.array(projectIdSchema).readonly(),
    isTutorial: z.boolean(),
    inToday: z.boolean(),
    isFocus: z.boolean(),
    isSecondary: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .readonly()

export type Item = z.infer<typeof itemSchema>

export const itemViewSchema = z.enum(["inbox", "today", "active", "completed", "archived"])

export type ItemQuery = {
  readonly view: z.infer<typeof itemViewSchema>
  readonly localDate: string
  readonly categoryId?: z.infer<typeof categoryIdSchema>
  readonly projectId?: z.infer<typeof projectIdSchema>
}

export type TodayItemInput = {
  readonly itemId: z.infer<typeof itemIdSchema>
  readonly localDate: string
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
