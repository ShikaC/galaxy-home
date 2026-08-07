import { z } from "zod"

export const actionAliasSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/)
  .optional()

export const entityRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      z.string().uuid().safeParse(value).success ||
      /^\$[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(value) ||
      !value.startsWith("$"),
    { message: "须为 UUID、$别名，或可解析的标题/名称" },
  )

export const chatActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create_habit"),
      name: z.string().trim().min(1).max(100),
      type: z.enum(["check", "count"]),
      targetCount: z.number().int().min(1).max(999),
      frequencyType: z.enum(["daily", "weekly"]),
      weeklyTarget: z.number().int().min(1).max(7).nullable(),
      restDays: z.array(z.number().int().min(0).max(6)).max(7),
      as: actionAliasSchema,
    })
    .readonly(),
  z
    .object({
      action: z.literal("create_item"),
      title: z.string().trim().min(1).max(240),
      notes: z.string().trim().max(10_000).optional(),
      categoryIds: z.array(entityRefSchema).max(20).default([]),
      projectIds: z.array(entityRefSchema).max(20).default([]),
      todayMode: z.enum(["today", "focus", "secondary"]).optional(),
      as: actionAliasSchema,
    })
    .readonly(),
  z
    .object({
      action: z.literal("update_item"),
      itemId: entityRefSchema,
      title: z.string().trim().min(1).max(240).optional(),
      notes: z.string().trim().max(10_000).nullable().optional(),
    })
    .readonly(),
  z
    .object({
      action: z.literal("set_today"),
      itemId: entityRefSchema,
      mode: z.enum(["today", "focus", "secondary", "clear"]),
    })
    .readonly(),
  z
    .object({
      action: z.literal("trash_item"),
      itemId: entityRefSchema,
    })
    .readonly(),
  z
    .object({
      action: z.literal("set_item_categories"),
      itemId: entityRefSchema,
      categoryIds: z.array(entityRefSchema).max(20),
    })
    .readonly(),
  z
    .object({
      action: z.literal("complete_item"),
      itemId: entityRefSchema,
    })
    .readonly(),
  z
    .object({
      action: z.literal("archive_item"),
      itemId: entityRefSchema,
    })
    .readonly(),
  z
    .object({
      action: z.literal("update_project_progress"),
      projectId: entityRefSchema,
      progress: z.number().int().min(0).max(100),
    })
    .readonly(),
  z
    .object({
      action: z.literal("create_project"),
      name: z.string().trim().min(1).max(100),
      desiredOutcome: z.string().trim().min(1).max(1_000),
      reason: z.string().trim().max(2_000).nullable().optional(),
      notes: z.string().trim().max(10_000).nullable().optional(),
      deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      stageTitle: z.string().trim().min(1).max(160).optional(),
      currentTask: z.string().trim().min(1).max(240).nullable().optional(),
      nextTask: z.string().trim().min(1).max(240).nullable().optional(),
      as: actionAliasSchema,
    })
    .readonly(),
  z
    .object({
      action: z.literal("propose_memory"),
      content: z.string().trim().min(1).max(5_000),
      kind: z.enum(["preference", "goal", "background"]),
    })
    .readonly(),
])

export type ChatAction = z.infer<typeof chatActionSchema>

const pendingChatActionObjectSchema = z
  .object({
    status: z.enum(["pending", "confirmed", "rejected"]),
    actions: z.array(chatActionSchema).min(1).max(12),
    summary: z.string(),
  })
  .readonly()

export const pendingChatActionSchema = z.preprocess((value) => {
  if (
    value !== null &&
    typeof value === "object" &&
    "action" in value &&
    !("actions" in value)
  ) {
    const legacy = value as {
      readonly status: unknown
      readonly action: unknown
      readonly summary: unknown
    }
    return {
      status: legacy.status,
      actions: [legacy.action],
      summary: legacy.summary,
    }
  }
  return value
}, pendingChatActionObjectSchema)

export type PendingChatAction = z.infer<typeof pendingChatActionObjectSchema>
