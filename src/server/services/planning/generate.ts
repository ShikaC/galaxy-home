import type { PlanInput, PlanRun } from "../../../shared/planning.js"
import type { AppContext } from "../../context.js"
import { getAppClock } from "../../context.js"
import { AiServiceError, type ChatMessage, requestCompletionWithUsage } from "../ai.js"
import { AiInvalidEndpointError } from "../aiEndpoint.js"
import { parseProposal, planningMessages } from "./proposal.js"
import { fingerprint, retrieveContext } from "./retrieval.js"
import { claimPlan, findPlan, finishPlan, PlanError, readPlan, renewPlanLease } from "./store.js"

export type PlanningModel = (
  messages: readonly ChatMessage[],
) => ReturnType<typeof requestCompletionWithUsage>
export function preparePlan(
  context: AppContext,
  input: PlanInput,
): { readonly run: PlanRun; readonly claimed: boolean } {
  const existing = findPlan(context.database, input.requestId)
  if (existing !== null) {
    if (fingerprint(existing.input) !== fingerprint(input))
      throw new PlanError("PLAN_REQUEST_CONFLICT", "同一请求标识不能用于不同的计划内容。")
    return { run: existing, claimed: false }
  }
  const retrieved = retrieveContext(context.database, input)
  const now = getAppClock(context).now().toISOString()
  const run: PlanRun = {
    id: input.requestId,
    input,
    status: "planning",
    promptVersion: "workspace-plan-v1",
    retrievalVersion: "lexical-bigram-v1",
    ...retrieved,
    proposal: null,
    attempts: [],
    results: [],
    error: null,
    createdAt: now,
    updatedAt: now,
    executionMs: null,
  }
  if (!claimPlan(context.database, run)) {
    const claimed = readPlan(context.database, input.requestId)
    if (fingerprint(claimed.input) !== fingerprint(input))
      throw new PlanError("PLAN_REQUEST_CONFLICT", "同一请求标识不能用于不同的计划内容。")
    return { run: claimed, claimed: false }
  }
  return { run, claimed: true }
}
export async function generatePlan(
  context: AppContext,
  input: PlanInput,
  model?: PlanningModel,
): Promise<PlanRun> {
  const prepared = preparePlan(context, input)
  return prepared.claimed ? completePlan(context, prepared.run, model) : prepared.run
}
export async function completePlan(
  context: AppContext,
  initial: PlanRun,
  model?: PlanningModel,
): Promise<PlanRun> {
  let run = initial
  const messages = [...planningMessages(run)]
  const requestModel =
    model ?? ((messages) => requestCompletionWithUsage(context.secretPath, messages, true))
  const heartbeat = setInterval(() => {
    try {
      renewPlanLease(context.database, run.id)
    } catch {
      process.emitWarning("Plan lease renewal failed; recovery may interrupt this run", {
        code: "PLAN_LEASE_RENEWAL_FAILED",
      })
    }
  }, 30_000)
  heartbeat.unref()
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const current = readPlan(context.database, run.id)
      if (current.status !== "planning") return current
      const started = performance.now()
      let completion: Awaited<ReturnType<PlanningModel>> | undefined
      try {
        completion = await requestModel(messages)
        const current = readPlan(context.database, run.id)
        if (current.status !== "planning") return current
        const proposal = parseProposal(completion.content, run)
        run = {
          ...run,
          proposal,
          status: proposal.clarification === null ? "awaiting_confirmation" : "needs_input",
          error: null,
          attempts: [
            ...run.attempts,
            {
              number: attempt,
              model: completion.model,
              durationMs: completion.durationMs,
              inputTokens: completion.inputTokens,
              outputTokens: completion.outputTokens,
              outcome: "accepted",
              code: null,
            },
          ],
        }
        break
      } catch (error) {
        const invalid = error instanceof PlanError && error.code === "INVALID_PLAN"
        const code =
          error instanceof PlanError ||
          error instanceof AiServiceError ||
          error instanceof AiInvalidEndpointError
            ? error.code
            : "AI_UNAVAILABLE"
        const message =
          error instanceof PlanError ||
          error instanceof AiServiceError ||
          error instanceof AiInvalidEndpointError
            ? error.message
            : "生成失败，请稍后重试。没有任务被写入。"
        run = {
          ...run,
          status: "failed",
          error: { code, message, retryable: true },
          attempts: [
            ...run.attempts,
            {
              number: attempt,
              model: completion?.model ?? null,
              durationMs: Math.round(performance.now() - started),
              inputTokens: completion?.inputTokens ?? null,
              outputTokens: completion?.outputTokens ?? null,
              outcome: invalid ? "invalid" : "unavailable",
              code,
            },
          ],
        }
        if (!invalid || attempt === 2) break
        messages.push({
          role: "user",
          content: `上一次响应未通过约束检查：${message} 请重新输出满足原始目标与约束的完整 JSON。`,
        })
      }
    }
    return finishPlan(context.database, {
      ...run,
      updatedAt: getAppClock(context).now().toISOString(),
    })
  } finally {
    clearInterval(heartbeat)
  }
}
