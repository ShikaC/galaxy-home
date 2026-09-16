import type { TaskPlanProposal, TaskPlanRun } from "../../../shared/taskPlanning.js"
import type { AppContext } from "../../context.js"
import { getAppClock } from "../../context.js"
import { validatePlanProposal } from "./planProposal.js"
import { statusAfterProposal } from "./proposal.js"
import { readTaskPlan, saveTaskPlan, TaskPlanError } from "./store.js"
import { deriveReplanProposal } from "./validate.js"

export function editTaskPlan(
  context: AppContext,
  id: string,
  expectedRevision: number,
  proposal: TaskPlanProposal,
): TaskPlanRun {
  context.database.exec("BEGIN IMMEDIATE")
  try {
    const run = readTaskPlan(context.database, id)
    if (
      (run.status !== "awaiting_confirmation" && run.status !== "needs_input") ||
      run.proposal === null
    )
      throw new TaskPlanError("TASK_PLAN_NOT_EDITABLE", "当前任务计划不可编辑")
    if (run.draftRevision !== expectedRevision)
      throw new TaskPlanError("TASK_PLAN_REVISION_CONFLICT", "任务计划已更新")
    if (proposal.kind !== run.input.type)
      throw new TaskPlanError("TASK_PLAN_TYPE_CONFLICT", "任务计划类型不能更改")
    const validatedProposal =
      proposal.kind === "plan" && run.input.type === "plan"
        ? validatePlanProposal(proposal, run)
        : proposal.kind === "replan" && run.input.type === "replan" && run.baseSnapshot !== null
          ? deriveReplanProposal(
              run.baseSnapshot,
              proposal,
              run.input.lockedItemIds,
              run.input.originalText,
              getAppClock(context).now(),
            ).proposal
          : proposal
    const edited = saveTaskPlan(context.database, {
      ...run,
      proposal: validatedProposal,
      draftRevision: run.draftRevision + 1,
      status: statusAfterProposal(validatedProposal),
      updatedAt: getAppClock(context).now().toISOString(),
    })
    context.database.exec("COMMIT")
    return edited
  } catch (error) {
    context.database.exec("ROLLBACK")
    throw error
  }
}

export function cancelTaskPlan(context: AppContext, id: string): TaskPlanRun {
  context.database.exec("BEGIN IMMEDIATE")
  try {
    const run = readTaskPlan(context.database, id)
    if (run.status === "succeeded")
      throw new TaskPlanError("TASK_PLAN_ALREADY_CONFIRMED", "已确认的任务计划不能取消")
    if (run.status === "cancelled") {
      context.database.exec("COMMIT")
      return run
    }
    const cancelled = saveTaskPlan(context.database, {
      ...run,
      status: "cancelled",
      updatedAt: getAppClock(context).now().toISOString(),
    })
    context.database.exec("COMMIT")
    return cancelled
  } catch (error) {
    context.database.exec("ROLLBACK")
    throw error
  }
}
