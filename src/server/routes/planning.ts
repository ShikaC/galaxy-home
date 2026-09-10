import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { planInputSchema } from "../../shared/planning.js"
import type { AppContext } from "../context.js"
import { cancelPlan, executePlan } from "../services/planning/execute.js"
import { generatePlan } from "../services/planning/generate.js"
import { listPlans, readPlan, recoverInterruptedPlans } from "../services/planning/store.js"

const idParams = z.object({ id: z.uuid() })
export function registerPlanningRoutes(app: FastifyInstance, context: AppContext): void {
  recoverInterruptedPlans(context.database)
  app.get("/api/plans", () => listPlans(context.database))
  app.get("/api/plans/:id", (request) => {
    recoverInterruptedPlans(context.database)
    return readPlan(context.database, idParams.parse(request.params).id)
  })
  app.post("/api/plans", async (request, reply) => {
    const run = await generatePlan(context, planInputSchema.parse(request.body))
    app.log.info(
      { runId: run.id, status: run.status, attemptCount: run.attempts.length },
      "Planning run completed",
    )
    return reply.code(201).send(run)
  })
  app.post("/api/plans/:id/confirm", (request) =>
    executePlan(context, idParams.parse(request.params).id),
  )
  app.post("/api/plans/:id/cancel", (request) =>
    cancelPlan(context, idParams.parse(request.params).id),
  )
}
