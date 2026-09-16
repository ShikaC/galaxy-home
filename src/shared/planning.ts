// 旧「知识计划」（planning）的数据契约，仅用于读取旧备份里的 `plan_runs` 表。
// 该能力已并入 shared/taskPlanning.ts 的 plan 模式，这里不再新增或写入数据；
// schema 保持原样，因为备份里的字段就是长这样，改它会降低损坏检测能力。
import { z } from "zod"

const localDate = z.iso.date()
export const planInputSchema = z
  .strictObject({
    requestId: z.uuid(),
    goal: z.string().trim().min(4).max(2000),
    startDate: localDate,
    horizonDays: z.number().int().min(1).max(7),
    dailyMinutes: z.number().int().min(5).max(480),
    contextMode: z.enum(["goal_only", "workspace"]),
  })
  .readonly()
export type PlanInput = z.infer<typeof planInputSchema>
export const proposedTaskSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(240),
    minutes: z.number().int().min(5).max(480),
    dayOffset: z.number().int().min(0).max(6),
    reason: z.string().trim().min(1).max(500),
    sourceIds: z.array(z.uuid()).max(6),
    existingItemId: z.uuid().nullable(),
  })
  .readonly()
export const proposalSchema = z
  .strictObject({
    summary: z.string().trim().min(1).max(1000),
    clarification: z.string().trim().min(1).max(500).nullable(),
    tasks: z.array(proposedTaskSchema).max(12),
  })
  .readonly()
export type Proposal = z.infer<typeof proposalSchema>
export const planEditSchema = z
  .strictObject({
    expectedRevision: z.number().int().nonnegative(),
    tasks: z.array(proposedTaskSchema).min(1).max(12),
  })
  .readonly()
export type PlanEdit = z.infer<typeof planEditSchema>
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
export const planAttemptSchema = z
  .object({
    number: z.number().int(),
    model: z.string().nullable(),
    durationMs: z.number().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    outcome: z.enum(["accepted", "invalid", "unavailable"]),
    code: z.string().nullable(),
  })
  .readonly()
export const planResultSchema = z
  .object({
    itemId: z.uuid(),
    title: z.string(),
    localDate,
    minutes: z.number(),
    disposition: z.enum(["created", "reused"]),
    secondary: z.boolean(),
    verified: z.literal(true),
  })
  .readonly()
export const planRunSchema = z
  .object({
    id: z.uuid(),
    input: planInputSchema,
    status: z.enum([
      "planning",
      "awaiting_confirmation",
      "needs_input",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    promptVersion: z.literal("workspace-plan-v1"),
    retrievalVersion: z.literal("lexical-bigram-v1"),
    sources: z.array(planSourceSchema),
    existingItems: z.array(planItemSchema),
    proposal: proposalSchema.nullable(),
    proposalRevision: z.number().int().nonnegative().optional(),
    attempts: z.array(planAttemptSchema),
    results: z.array(planResultSchema),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    executionMs: z.number().nonnegative().nullable(),
  })
  .readonly()
export type PlanRun = z.infer<typeof planRunSchema>
export type PlanSource = z.infer<typeof planSourceSchema>
export const planRunsSchema = z.array(planRunSchema)
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
