import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  calendarQuerySchema,
  calendarValidateInputSchema,
  workWindowRuleSchema,
} from "../../shared/calendar.js"
import { ERROR_CODES } from "../../shared/errorCodes.js"
import { type AppContext, getAppClock } from "../context.js"
import { updateItem } from "../repositories/items.js"
import { withImmediateTransaction } from "../repositories/transaction.js"
import { buildCalendarSnapshot, validateScheduleChanges } from "../services/calendar.js"
import { localClock } from "../services/time.js"

export function registerCalendarRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/api/calendar", (request) => {
    const raw = z
      .object({
        startDate: z.string(),
        endDate: z.string(),
        timezone: z.string(),
        workWindow: z.string().optional(),
      })
      .parse(request.query)
    const workWindow =
      raw.workWindow === undefined
        ? undefined
        : z
            .string()
            .transform((value, context) => {
              try {
                const parsed: unknown = JSON.parse(value)
                return parsed
              } catch (error) {
                if (!(error instanceof SyntaxError)) throw error
                context.addIssue({ code: "custom", message: "工作时段格式无效" })
                return z.NEVER
              }
            })
            .pipe(z.array(workWindowRuleSchema).readonly())
            .parse(raw.workWindow)
    return buildCalendarSnapshot(
      context.database,
      calendarQuerySchema.parse({ ...raw, ...(workWindow === undefined ? {} : { workWindow }) }),
    )
  })

  app.post("/api/calendar/schedule", (request, reply) => {
    const input = calendarValidateInputSchema.parse(request.body)
    const [change] = input.changes
    if (input.changes.length !== 1 || change === undefined)
      return reply.code(400).send({ message: "每次手动安排一个任务" })
    return withImmediateTransaction(context.database, () => {
      const snapshot = buildCalendarSnapshot(context.database, input)
      const validation = validateScheduleChanges(snapshot, input.changes, { manual: true })
      if (!validation.valid)
        return reply.code(409).send({
          message: validation.blockers.map((entry) => entry.message).join("；"),
          code: ERROR_CODES.CALENDAR_CONFLICT,
        })
      const instant = getAppClock(context).now()
      return updateItem(
        context.database,
        change.itemId,
        {
          expectedVersion: change.expectedVersion,
          scheduledStartAt: change.scheduledStartAt,
          scheduledEndAt: change.scheduledEndAt,
          scheduleTimezone: change.scheduleTimezone,
        },
        localClock(instant, input.timezone).date,
        instant,
      )
    })
  })
}
