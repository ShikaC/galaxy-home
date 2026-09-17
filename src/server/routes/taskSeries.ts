import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  createTaskSeriesInputSchema,
  materializeTaskSeriesInputSchema,
  skipOccurrenceInputSchema,
  updateTaskSeriesInputSchema,
} from "../../shared/recurrence.js"
import { type AppContext, getAppClock } from "../context.js"
import { getSettings } from "../repositories/settings.js"
import { listTaskSeries } from "../repositories/taskSeries.js"
import {
  createTaskSeries,
  materializeTaskSeries,
  skipOccurrence,
  updateTaskSeries,
} from "../services/recurrence.js"
import { localClock } from "../services/time.js"

const idParamsSchema = z.object({ id: z.uuid() })

export function registerTaskSeriesRoutes(app: FastifyInstance, context: AppContext): void {
  const clock = getAppClock(context)
  app.get("/api/task-series", () => listTaskSeries(context.database))
  app.post("/api/task-series", (request, reply) => {
    const input = createTaskSeriesInputSchema.parse(request.body)
    const instant = clock.now()
    return reply
      .code(201)
      .send(
        createTaskSeries(
          context.database,
          input,
          localClock(instant, input.timezone).date,
          instant,
        ),
      )
  })
  app.patch("/api/task-series/:id", (request) =>
    updateTaskSeries(
      context.database,
      idParamsSchema.parse(request.params).id,
      updateTaskSeriesInputSchema.parse(request.body),
      clock.now(),
    ),
  )
  app.post("/api/task-series/:id/materialize", (request) => {
    const input = materializeTaskSeriesInputSchema.parse(request.body)
    const createdCount = materializeTaskSeries(
      context.database,
      idParamsSchema.parse(request.params).id,
      { fromDate: input.fromDate, toDate: input.toDate },
      clock.now(),
    )
    return { createdCount }
  })
  app.post("/api/items/:id/skip", (request) => {
    const itemId = idParamsSchema.parse(request.params).id
    const input = skipOccurrenceInputSchema.parse(request.body)
    const instant = clock.now()
    return skipOccurrence(
      context.database,
      itemId,
      input.expectedVersion,
      localClock(instant, getSettings(context.database).timezone).date,
      instant,
    )
  })
}
