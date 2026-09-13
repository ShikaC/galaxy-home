import type { CalendarSnapshot } from "../../../shared/calendar.js"
import type { TaskPlanInput, TaskPlanRun } from "../../../shared/taskPlanning.js"
import type { AppContext } from "../../context.js"
import { getAppClock } from "../../context.js"
import { getSettings } from "../../repositories/settings.js"
import { AiServiceError, type ChatMessage, requestCompletionWithUsage } from "../ai.js"
import { AiInvalidEndpointError } from "../aiEndpoint.js"
import { buildCalendarSnapshot } from "../calendar.js"
import { parseTaskPlanProposal, taskPlanningMessages } from "./proposal.js"
import {
  claimTaskPlan,
  findTaskPlan,
  finishTaskPlan,
  readTaskPlan,
  renewTaskPlanLease,
  TaskPlanError,
  taskPlanInputFingerprint,
} from "./store.js"
import { deriveReplanProposal } from "./validate.js"

export type TaskPlanningModel = (
  messages: readonly ChatMessage[],
) => ReturnType<typeof requestCompletionWithUsage>
export type TaskPlanSnapshotProvider = (
  input: Extract<TaskPlanInput, { readonly type: "replan" }>,
) => CalendarSnapshot

export function prepareTaskPlan(
  context: AppContext,
  input: TaskPlanInput,
  snapshotProvider?: TaskPlanSnapshotProvider,
): { readonly run: TaskPlanRun; readonly claimed: boolean } {
  const existing = findTaskPlan(context.database, input.requestId)
  if (existing !== null) {
    if (taskPlanInputFingerprint(existing.input) !== taskPlanInputFingerprint(input))
      throw new TaskPlanError("TASK_PLAN_REQUEST_CONFLICT", "同一请求标识不能用于不同内容")
    return { run: existing, claimed: false }
  }
  if (input.type === "replan" && getSettings(context.database).aiPermission !== "open")
    throw new TaskPlanError(
      "TASK_PLAN_CONTEXT_PERMISSION",
      "请先在设置中开启开放模式，再让 AI 读取并重排日历",
    )
  const provider =
    snapshotProvider ??
    ((value: Extract<TaskPlanInput, { readonly type: "replan" }>) =>
      buildCalendarSnapshot(context.database, value))
  const now = getAppClock(context).now().toISOString()
  const run: TaskPlanRun = {
    id: input.requestId,
    input,
    promptVersion: "task-plan-v2",
    status: "planning",
    draftRevision: 0,
    baseSnapshot: input.type === "replan" ? provider(input) : null,
    proposal: null,
    attempts: [],
    results: [],
    error: null,
    createdAt: now,
    updatedAt: now,
    executionMs: null,
  }
  if (claimTaskPlan(context.database, run)) return { run, claimed: true }
  const claimed = readTaskPlan(context.database, input.requestId)
  if (taskPlanInputFingerprint(claimed.input) !== taskPlanInputFingerprint(input))
    throw new TaskPlanError("TASK_PLAN_REQUEST_CONFLICT", "同一请求标识不能用于不同内容")
  return { run: claimed, claimed: false }
}

export async function completeTaskPlan(
  context: AppContext,
  initial: TaskPlanRun,
  model?: TaskPlanningModel,
): Promise<TaskPlanRun> {
  let run = initial
  const messages = [...taskPlanningMessages(run, getAppClock(context).now())]
  const requestModel =
    model ??
    ((messages: readonly ChatMessage[]) =>
      requestCompletionWithUsage(context.secretPath, messages, true))
  const heartbeat = setInterval(() => renewTaskPlanLease(context.database, run.id), 30_000)
  heartbeat.unref()
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (readTaskPlan(context.database, run.id).status !== "planning")
        return readTaskPlan(context.database, run.id)
      const started = performance.now()
      let completion: Awaited<ReturnType<TaskPlanningModel>> | undefined
      try {
        completion = await requestModel(messages)
        if (readTaskPlan(context.database, run.id).status !== "planning")
          return readTaskPlan(context.database, run.id)
        const parsedProposal = parseTaskPlanProposal(completion.content, run)
        const proposal =
          parsedProposal.kind === "replan" &&
          run.input.type === "replan" &&
          run.baseSnapshot !== null
            ? deriveReplanProposal(
                run.baseSnapshot,
                parsedProposal,
                run.input.lockedItemIds,
                run.input.originalText,
                getAppClock(context).now(),
              ).proposal
            : parsedProposal
        run = {
          ...run,
          proposal,
          status:
            proposal.kind === "capture" && proposal.ambiguities.length > 0
              ? "needs_input"
              : "awaiting_confirmation",
          attempts: [
            ...run.attempts,
            {
              model: completion.model,
              durationMs: completion.durationMs,
              inputTokens: completion.inputTokens,
              outputTokens: completion.outputTokens,
              outcome: "accepted",
              code: null,
            },
          ],
          error: null,
        }
        break
      } catch (error) {
        const invalid = error instanceof TaskPlanError && error.code === "INVALID_TASK_PLAN"
        const known =
          error instanceof TaskPlanError ||
          error instanceof AiServiceError ||
          error instanceof AiInvalidEndpointError
        const code = known ? error.code : "AI_UNAVAILABLE"
        const message = known ? error.message : "生成失败；没有业务数据被写入"
        run = {
          ...run,
          status: "failed",
          attempts: [
            ...run.attempts,
            {
              model: completion?.model ?? null,
              durationMs: Math.round(performance.now() - started),
              inputTokens: completion?.inputTokens ?? null,
              outputTokens: completion?.outputTokens ?? null,
              outcome: invalid ? "invalid" : "unavailable",
              code,
            },
          ],
          error: { code, message, retryable: true },
        }
        if (!invalid || attempt === 1) break
        messages.push(
          { role: "assistant", content: completion?.content ?? "{}" },
          {
            role: "user",
            content: JSON.stringify({
              validationError: { code, message },
              instruction: "修正上一次 JSON，完整重发，不能丢失原请求约束",
            }),
          },
        )
      }
    }
    return finishTaskPlan(context.database, {
      ...run,
      updatedAt: getAppClock(context).now().toISOString(),
    })
  } finally {
    clearInterval(heartbeat)
  }
}

export async function generateTaskPlan(
  context: AppContext,
  input: TaskPlanInput,
  model?: TaskPlanningModel,
  snapshotProvider?: TaskPlanSnapshotProvider,
): Promise<TaskPlanRun> {
  const prepared = prepareTaskPlan(context, input, snapshotProvider)
  return prepared.claimed ? completeTaskPlan(context, prepared.run, model) : prepared.run
}
