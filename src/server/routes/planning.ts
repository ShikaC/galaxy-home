import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { planEditSchema, planInputSchema } from "../../shared/planning.js"
import type { AppContext } from "../context.js"
import { editPlan } from "../services/planning/edit.js"
import { cancelPlan, executePlan } from "../services/planning/execute.js"
import { completePlan, generatePlan, preparePlan } from "../services/planning/generate.js"
import { listPlans, readPlan, recoverInterruptedPlans } from "../services/planning/store.js"

const idParams = z.object({ id: z.uuid() })
export function registerPlanningRoutes(app: FastifyInstance, context: AppContext): void {
  const active = new Set<Promise<void>>()
  let closing = false
  app.addHook("preClose", async () => {
    closing = true
    await Promise.allSettled(active)
  })
  recoverInterruptedPlans(context.database)
  app.get("/api/plans", () => listPlans(context.database))
  app.get("/api/plans/:id", (request) => {
    recoverInterruptedPlans(context.database)
    return readPlan(context.database, idParams.parse(request.params).id)
  })
  app.post("/api/plans", async (request, reply) => {
    if (closing)
      return reply
        .code(503)
        .send({ code: "SERVER_CLOSING", message: "服务正在关闭，请重新打开后再生成。" })
    const input = planInputSchema.parse(request.body)
    if (request.headers["prefer"] === "respond-async") {
      const prepared = preparePlan(context, input)
      if (prepared.claimed) {
        const work = completePlan(context, prepared.run)
          .then((run) => {
            app.log.info({ runId: run.id, status: run.status }, "Planning run completed")
          })
          .catch((error: unknown) => {
            app.log.error(
              {
                runId: prepared.run.id,
                errorType: error instanceof Error ? error.name : "unknown",
              },
              "Planning run interrupted",
            )
          })
          .finally(() => {
            active.delete(work)
          })
        active.add(work)
      }
      return reply.code(prepared.run.status === "planning" ? 202 : 200).send(prepared.run)
    }
    const run = await generatePlan(context, input)
    app.log.info(
      { runId: run.id, status: run.status, attemptCount: run.attempts.length },
      "Planning run completed",
    )
    return reply.code(201).send(run)
  })
  app.post("/api/plans/:id/confirm", (request) =>
    executePlan(
      context,
      idParams.parse(request.params).id,
      z
        .object({ expectedRevision: z.number().int().nonnegative().default(0) })
        .parse(request.body ?? {}).expectedRevision,
    ),
  )
  app.patch("/api/plans/:id", (request) =>
    editPlan(context, idParams.parse(request.params).id, planEditSchema.parse(request.body)),
  )
  app.post("/api/plans/:id/cancel", (request) =>
    cancelPlan(context, idParams.parse(request.params).id),
  )
}
