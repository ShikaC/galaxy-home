import { z } from "zod"
import { calendarSnapshotSchema, workWindowRuleSchema } from "./calendar.js"
import { recurrenceRuleSchema } from "./recurrence.js"
import { ianaTimezoneSchema } from "./taskCore.js"

const localDateSchema = z.iso.date()
const timezoneSchema = ianaTimezoneSchema

export const taskPlanInputSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      type: z.literal("capture"),
      requestId: z.uuid(),
      originalText: z.string().trim().min(1).max(10_000),
      referenceDate: localDateSchema,
      timezone: timezoneSchema,
    })
    .readonly(),
  z
    .strictObject({
      type: z.literal("replan"),
      requestId: z.uuid(),
      originalText: z.string().trim().min(1).max(10_000),
      startDate: localDateSchema,
      endDate: localDateSchema,
      timezone: timezoneSchema,
      workWindow: z.array(workWindowRuleSchema).max(14).readonly().optional(),
      lockedItemIds: z.array(z.uuid()).max(500).default([]).readonly(),
    })
    .readonly()
    .refine((value) => value.startDate < value.endDate, {
      message: "结束日期不能早于开始日期",
      path: ["endDate"],
    }),
  // 从目标与工作区笔记生成计划。原「知识计划」能力，融合后成为第三种子模式。
  z
    .strictObject({
      type: z.literal("plan"),
      requestId: z.uuid(),
      goal: z.string().trim().min(4).max(2_000),
      startDate: localDateSchema,
      horizonDays: z.number().int().min(1).max(7),
      contextMode: z.enum(["goal_only", "workspace"]),
    })
    .readonly(),
])
export type TaskPlanInput = z.infer<typeof taskPlanInputSchema>

export const captureTaskDraftSchema = z
  .strictObject({
    draftId: z.uuid(),
    title: z.string().trim().min(1).max(240),
    notes: z.string().trim().max(10_000).nullable(),
    priority: z.enum(["none", "low", "medium", "high"]),
    dueDate: localDateSchema.nullable(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
  })
  .readonly()
export const captureSeriesDraftSchema = z
  .strictObject({
    draftId: z.uuid(),
    title: z.string().trim().min(1).max(240),
    notes: z.string().trim().max(10_000).nullable(),
    priority: z.enum(["none", "low", "medium", "high"]),
    timezone: timezoneSchema,
    startDate: localDateSchema,
    rule: recurrenceRuleSchema,
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
    dueTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
  })
  .readonly()

export const captureProposalSchema = z
  .strictObject({
    kind: z.literal("capture"),
    tasks: z.array(captureTaskDraftSchema).max(100).readonly(),
    series: z.array(captureSeriesDraftSchema).max(20).readonly(),
    ambiguities: z.array(z.string().trim().min(1).max(500)).max(20).readonly(),
  })
  .readonly()

export const scheduleSlotSchema = z
  .strictObject({ startAt: z.iso.datetime(), endAt: z.iso.datetime(), timezone: timezoneSchema })
  .readonly()
export const replanChangeSchema = z.discriminatedUnion("action", [
  z
    .strictObject({
      action: z.literal("keep"),
      itemId: z.uuid(),
      before: scheduleSlotSchema.nullable(),
      after: scheduleSlotSchema.nullable(),
      reason: z.string().trim().min(1).max(1000),
    })
    .readonly(),
  z
    .strictObject({
      action: z.literal("move"),
      itemId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      before: scheduleSlotSchema.nullable(),
      after: scheduleSlotSchema,
      reason: z.string().trim().min(1).max(1000),
    })
    .readonly(),
  z
    .strictObject({
      action: z.literal("create"),
      draftId: z.uuid(),
      title: z.string().trim().min(1).max(240),
      estimatedMinutes: z.number().int().min(1).max(1440),
      after: scheduleSlotSchema,
      reason: z.string().trim().min(1).max(1000),
    })
    .readonly(),
])
export const taskPlanConflictSchema = z
  .strictObject({
    code: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(1000),
    itemId: z.uuid().nullable(),
    blocking: z.boolean(),
  })
  .readonly()

// 计划模式的检索结果：作为任务依据的笔记与可复用的活动任务。
export const planSourceSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    excerpt: z.string(),
    fingerprint: z.string(),
    score: z.number(),
  })
  .readonly()
export const planItemSchema = z
  .object({ id: z.uuid(), title: z.string(), fingerprint: z.string() })
  .readonly()
export const planDraftTaskSchema = z
  .strictObject({
    draftId: z.uuid(),
    title: z.string().trim().min(1).max(240),
    dayOffset: z.number().int().min(0).max(6),
    reason: z.string().trim().min(1).max(500),
    sourceIds: z.array(z.uuid()).max(6).readonly(),
    existingItemId: z.uuid().nullable(),
  })
  .readonly()
export const planProposalSchema = z
  .strictObject({
    kind: z.literal("plan"),
    summary: z.string().trim().min(1).max(1000),
    clarification: z.string().trim().min(1).max(500).nullable(),
    tasks: z.array(planDraftTaskSchema).max(12).readonly(),
  })
  .readonly()
export type PlanProposal = z.infer<typeof planProposalSchema>
export type PlanSource = z.infer<typeof planSourceSchema>
export type PlanItem = z.infer<typeof planItemSchema>
export type PlanDraftTask = z.infer<typeof planDraftTaskSchema>

export const replanProposalSchema = z
  .strictObject({
    kind: z.literal("replan"),
    changes: z.array(replanChangeSchema).max(500).readonly(),
    unresolvedConflicts: z.array(taskPlanConflictSchema).max(500).readonly(),
  })
  .readonly()
export const taskPlanProposalSchema = z.discriminatedUnion("kind", [
  captureProposalSchema,
  replanProposalSchema,
  planProposalSchema,
])
export type TaskPlanProposal = z.infer<typeof taskPlanProposalSchema>

const attemptSchema = z
  .strictObject({
    model: z.string().nullable(),
    durationMs: z.number().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    outcome: z.enum(["accepted", "invalid", "unavailable"]),
    code: z.string().nullable(),
  })
  .readonly()
export const taskPlanRunSchema = z
  .strictObject({
    id: z.uuid(),
    input: taskPlanInputSchema,
    promptVersion: z.enum(["task-plan-v1", "task-plan-v2", "workspace-plan-v1"]),
    status: z.enum([
      "planning",
      "awaiting_confirmation",
      "needs_input",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    draftRevision: z.number().int().nonnegative(),
    baseSnapshot: calendarSnapshotSchema.nullable(),
    proposal: taskPlanProposalSchema.nullable(),
    attempts: z.array(attemptSchema).readonly(),
    // 仅 plan 模式填充，旧 run 读取时补空数组。
    sources: z.array(planSourceSchema).readonly().default([]),
    existingItems: z.array(planItemSchema).readonly().default([]),
    results: z
      .array(
        z
          .strictObject({
            kind: z.enum(["item", "series", "schedule"]),
            id: z.uuid(),
            verified: z.literal(true),
            localDate: localDateSchema.optional(),
            minutes: z.number().int().nonnegative().optional(),
            disposition: z.enum(["created", "reused"]).optional(),
            secondary: z.boolean().optional(),
          })
          .readonly(),
      )
      .readonly(),
    error: z
      .strictObject({ code: z.string(), message: z.string(), retryable: z.boolean() })
      .nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    executionMs: z.number().nonnegative().nullable(),
  })
  .readonly()
export type TaskPlanRun = z.infer<typeof taskPlanRunSchema>
export const taskPlanRunsSchema = z.array(taskPlanRunSchema).readonly()
export const taskPlanEditSchema = z
  .strictObject({
    expectedRevision: z.number().int().nonnegative(),
    proposal: taskPlanProposalSchema,
  })
  .readonly()
export const taskPlanConfirmSchema = z
  .strictObject({ expectedRevision: z.number().int().nonnegative() })
  .readonly()

// plan 模式把 dayOffset 折算为具体日期；与日历快照无关，不依赖时区。
export function planDate(startDate: string, dayOffset: number): string {
  const date = new Date(`${startDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + dayOffset)
  return date.toISOString().slice(0, 10)
}

export function normalizedTaskTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{Z}\s]/gu, "")
}

// 三种模式对「用户输入的是哪段文字」的说法不同：capture/replan 是 originalText，plan 是 goal。
export function taskPlanInputText(input: TaskPlanInput): string {
  return input.type === "plan" ? input.goal : input.originalText
}

export function taskPlanInputTitle(input: TaskPlanInput): string {
  if (input.type === "capture") return "任务识别预览"
  if (input.type === "replan") return "日历调整预览"
  return "目标规划预览"
}

export function taskPlanInputKind(input: TaskPlanInput): string {
  if (input.type === "capture") return "录入"
  if (input.type === "replan") return "重排"
  return "规划"
}
