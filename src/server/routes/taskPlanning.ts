import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  taskPlanConfirmSchema,
  taskPlanEditSchema,
  taskPlanInputSchema,
} from "../../shared/taskPlanning.js"
import type { AppContext } from "../context.js"
import { confirmTaskPlan } from "../services/taskPlanning/confirm.js"
import { cancelTaskPlan, editTaskPlan } from "../services/taskPlanning/edit.js"
import { completeTaskPlan, prepareTaskPlan } from "../services/taskPlanning/generate.js"
import { listTaskPlans, readTaskPlan, recoverTaskPlans } from "../services/taskPlanning/store.js"

const idParamsSchema = z.strictObject({ id: z.uuid() })

export function registerTaskPlanningRoutes(app: FastifyInstance, context: AppContext): void {
  const active = new Set<Promise<void>>()
  recoverTaskPlans(context.database)
  app.get("/api/task-plans", () => listTaskPlans(context.database))
  app.get("/api/task-plans/:id", (request) =>
    readTaskPlan(context.database, idParamsSchema.parse(request.params).id),
  )
  app.post("/api/task-plans", (request, reply) => {
    const prepared = prepareTaskPlan(context, taskPlanInputSchema.parse(request.body))
    if (prepared.claimed) {
      const work = completeTaskPlan(context, prepared.run)
        .then(() => undefined)
        .catch((error: unknown) => {
          app.log.error(
            { runId: prepared.run.id, errorType: error instanceof Error ? error.name : "unknown" },
            "Task planning run interrupted",
          )
        })
        .finally(() => active.delete(work))
      active.add(work)
    }
    return reply.code(prepared.run.status === "planning" ? 202 : 200).send(prepared.run)
  })
  app.patch("/api/task-plans/:id", (request) => {
    const input = taskPlanEditSchema.parse(request.body)
    return editTaskPlan(
      context,
      idParamsSchema.parse(request.params).id,
      input.expectedRevision,
      input.proposal,
    )
  })
  app.post("/api/task-plans/:id/confirm", (request) =>
    confirmTaskPlan(
      context,
      idParamsSchema.parse(request.params).id,
      taskPlanConfirmSchema.parse(request.body).expectedRevision,
    ),
  )
  app.post("/api/task-plans/:id/cancel", (request) =>
    cancelTaskPlan(context, idParamsSchema.parse(request.params).id),
  )
  app.addHook("preClose", async () => {
    await Promise.allSettled(active)
  })
}
