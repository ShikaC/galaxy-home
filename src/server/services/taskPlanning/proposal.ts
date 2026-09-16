import { z } from "zod"
import {
  captureProposalSchema,
  replanProposalSchema,
  type TaskPlanProposal,
  type TaskPlanRun,
} from "../../../shared/taskPlanning.js"
import type { ChatMessage } from "../ai.js"
import { parsePlanProposal, planMessages } from "./planProposal.js"
import { TaskPlanError } from "./store.js"

export function taskPlanningMessages(run: TaskPlanRun, currentTime: Date): readonly ChatMessage[] {
  // plan 模式有独立提示词：它携带检索到的笔记与可复用任务，不用 JSON Schema 描述输出。
  if (run.input.type === "plan") return planMessages(run)
  const schema = run.input.type === "capture" ? captureProposalSchema : replanProposalSchema
  return [
    {
      role: "system",
      content:
        "你是任务录入与日历重排助手。只输出符合给定 JSON Schema 的 JSON，不执行写入。每个 draftId 必须生成 UUID。保留所有不确定信息为 ambiguities 或 unresolvedConflicts。工作日系列用 weekly、interval=1、weekdays=[1,2,3,4,5]。所有相对日期必须从请求 referenceDate 与 timezone 推导；例如 referenceDate 为 2026-09-10 时，本周五是 2026-09-11。重排时 currentTime 是本次生成的当前 UTC 时刻，按 input.timezone 理解本地时间。日历快照包含过去的时段，只能在 currentTime 之后、请求范围内的剩余空闲时间安排新任务或移动任务；空闲时段跨过当前时刻时只能使用尚未过去的部分。不要移动固定、已完成或 lockedItemIds 中的任务。JSON Schema：" +
        JSON.stringify(z.toJSONSchema(schema)),
    },
    {
      role: "user",
      content: JSON.stringify({
        currentTime: currentTime.toISOString(),
        input: run.input,
        calendar: run.baseSnapshot,
      }),
    },
  ]
}

export function parseTaskPlanProposal(content: string, run: TaskPlanRun): TaskPlanProposal {
  if (run.input.type === "plan") return parsePlanProposal(content, run)
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new TaskPlanError("INVALID_TASK_PLAN", "AI 没有返回有效 JSON")
  }
  const schema = run.input.type === "capture" ? captureProposalSchema : replanProposalSchema
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new TaskPlanError("INVALID_TASK_PLAN", "AI 返回的任务计划结构无效")
  if (parsed.data.kind !== run.input.type)
    throw new TaskPlanError("INVALID_TASK_PLAN", "计划类型与请求不匹配")
  if (parsed.data.kind === "replan" && run.input.type === "replan") {
    const lockedItemIds = run.input.lockedItemIds
    if (
      parsed.data.changes.some(
        (change) => change.action === "move" && lockedItemIds.includes(change.itemId),
      )
    )
      throw new TaskPlanError("INVALID_TASK_PLAN", "AI 试图移动用户锁定的任务")
  }
  if (
    parsed.data.kind === "capture" &&
    parsed.data.tasks.length === 0 &&
    parsed.data.series.length === 0 &&
    parsed.data.ambiguities.length === 0
  )
    throw new TaskPlanError("INVALID_TASK_PLAN", "任务计划没有可确认内容")
  return parsed.data
}

// capture 用 ambiguities 表示待澄清，plan 用 clarification；两者都需要用户补充输入后才能确认。
export function statusAfterProposal(proposal: TaskPlanProposal): TaskPlanRun["status"] {
  if (proposal.kind === "capture")
    return proposal.ambiguities.length > 0 ? "needs_input" : "awaiting_confirmation"
  if (proposal.kind === "plan")
    return proposal.clarification === null ? "awaiting_confirmation" : "needs_input"
  return "awaiting_confirmation"
}
