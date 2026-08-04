import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { createHabitInputSchema, setHabitLogInputSchema } from "../../shared/habits.js"
import { advanceProjectInputSchema, createProjectInputSchema } from "../../shared/projects.js"
import type { AppContext } from "../context.js"
import {
  createHabit,
  listHabitDaySummaries,
  listHabits,
  recordHabit,
  setHabitLog,
  undoHabit,
} from "../repositories/habits.js"
import {
  advanceProject,
  createProject,
  getProject,
  listProjects,
} from "../repositories/projects.js"

const dateQuerySchema = z.object({ localDate: z.string() })
const rangeQuerySchema = z.object({ start: z.string(), end: z.string() })
const idSchema = z.object({ id: z.string().uuid() })
const progressSchema = z.object({
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
})

export function registerDomainRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/api/habits", (request) =>
    listHabits(context.database, dateQuerySchema.parse(request.query).localDate),
  )
  app.get("/api/habits/summaries", (request) => {
    const query = rangeQuerySchema.parse(request.query)
    return listHabitDaySummaries(context.database, query.start, query.end)
  })
  app.post("/api/habits", (request, reply) =>
    reply.code(201).send(createHabit(context.database, createHabitInputSchema.parse(request.body))),
  )
  app.post("/api/habits/:id/record", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    recordHabit(context.database, id, dateQuerySchema.parse(request.body).localDate)
    return reply.code(204).send()
  })
  app.post("/api/habits/:id/undo", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    undoHabit(context.database, id, dateQuerySchema.parse(request.body).localDate)
    return reply.code(204).send()
  })
  app.put("/api/habit-logs", (request, reply) => {
    setHabitLog(context.database, setHabitLogInputSchema.parse(request.body))
    return reply.code(204).send()
  })

  app.get("/api/projects", () => listProjects(context.database))
  app.get("/api/projects/:id", (request) =>
    getProject(context.database, idSchema.parse(request.params).id),
  )
  app.post("/api/projects", (request, reply) =>
    reply
      .code(201)
      .send(createProject(context.database, createProjectInputSchema.parse(request.body))),
  )
  app.post("/api/projects/:id/advance", (request, reply) => {
    advanceProject(
      context.database,
      idSchema.parse(request.params).id,
      advanceProjectInputSchema.parse(request.body),
    )
    return reply.code(204).send()
  })
  app.patch("/api/projects/:id", (request) => {
    const { id } = idSchema.parse(request.params)
    const body = progressSchema.parse(request.body)
    const current = getProject(context.database, id)
    context.database
      .prepare(
        "UPDATE projects SET status = ?, progress = ?, progress_source = 'manual', updated_at = ? WHERE id = ?",
      )
      .run(
        body.status ?? current.status,
        body.progress ?? current.progress,
        new Date().toISOString(),
        id,
      )
    return getProject(context.database, id)
  })
}
