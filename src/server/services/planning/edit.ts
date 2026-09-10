import type { PlanEdit, PlanRun } from "../../../shared/planning.js"
import type { AppContext } from "../../context.js"
import { getAppClock } from "../../context.js"
import { validateProposal } from "./proposal.js"
import { PlanError, readPlan, savePlan } from "./store.js"

export function editPlan(context: AppContext, id: string, input: PlanEdit): PlanRun {
  const { database } = context
  database.exec("BEGIN IMMEDIATE")
  try {
    const run = readPlan(database, id)
    if (run.status !== "awaiting_confirmation" || run.proposal === null)
      throw new PlanError("PLAN_NOT_EDITABLE", "仅待确认的计划可以调整。")
    if ((run.proposalRevision ?? 0) !== input.expectedRevision)
      throw new PlanError("PLAN_REVISION_CONFLICT", "计划已更新，请重新打开后再调整。")
    const proposal = validateProposal({ ...run.proposal, tasks: input.tasks }, run)
    const edited = savePlan(database, {
      ...run,
      proposal,
      proposalRevision: (run.proposalRevision ?? 0) + 1,
      updatedAt: getAppClock(context).now().toISOString(),
    })
    database.exec("COMMIT")
    return edited
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
