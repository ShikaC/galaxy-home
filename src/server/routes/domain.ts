import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  createHabitInputSchema,
  setHabitLogInputSchema,
  updateHabitInputSchema,
} from "../../shared/habits.js"
import {
  advanceProjectInputSchema,
  completeProjectStageInputSchema,
  createProjectInputSchema,
  projectAiAnswerInputSchema,
  projectAiFeedbackInputSchema,
  projectAiStartInputSchema,
  updateProjectInputSchema,
} from "../../shared/projects.js"
import { type AppContext, getAppClock } from "../context.js"
import {
  copyHabit,
  createHabit,
  getHabit,
  listHabitDaySummaries,
  listHabits,
  recordHabit,
  setHabitLog,
  undoHabit,
  updateHabit,
} from "../repositories/habits.js"
import { applyProjectAiPlan, getProjectAiSession } from "../repositories/projectAi.js"
import { completeProjectStage, updateProject } from "../repositories/projectLifecycle.js"
import { addAiProjectTaskToToday } from "../repositories/projectRecommendations.js"
import {
  advanceProject,
  createProject,
  getProject,
  listProjects,
} from "../repositories/projects.js"
import { getSettings } from "../repositories/settings.js"
import { moveToTrash } from "../repositories/trash.js"
import {
  advanceProjectFromAiFeedback,
  answerProjectAiClarification,
  startProjectAiClarification,
} from "../services/projectAi.js"
import { resumeProject } from "../services/projectResume.js"
import { localClock } from "../services/time.js"

const dateQuerySchema = z.object({ localDate: z.string() })
const localDateInputSchema = z.object({ localDate: z.iso.date() })
const rangeQuerySchema = z.object({ start: z.string(), end: z.string() })
const idSchema = z.object({ id: z.string().uuid() })

export function registerDomainRoutes(app: FastifyInstance, context: AppContext): void {
  const clock = getAppClock(context)
  app.get("/api/habits", (request) =>
    listHabits(context.database, dateQuerySchema.parse(request.query).localDate),
  )
  app.get("/api/habits/summaries", (request) => {
    const query = rangeQuerySchema.parse(request.query)
    return listHabitDaySummaries(context.database, query.start, query.end)
  })
  app.post("/api/habits", (request, reply) => {
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    return reply
      .code(201)
      .send(createHabit(context.database, createHabitInputSchema.parse(request.body), localDate))
  })
  app.patch("/api/habits/:id", (request) => {
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    return updateHabit(
      context.database,
      idSchema.parse(request.params).id,
      updateHabitInputSchema.parse(request.body),
      localDate,
    )
  })
  app.post("/api/habits/:id/copy", (request, reply) => {
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    return reply
      .code(201)
      .send(copyHabit(context.database, idSchema.parse(request.params).id, localDate))
  })
  app.delete("/api/habits/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const now = clock.now()
    const localDate = localClock(now, getSettings(context.database).timezone).date
    const habit = getHabit(context.database, id, localDate)
    moveToTrash(context.database, "habit", id, habit.name, now)
    return reply.code(204).send()
  })
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
  app.post("/api/projects/:id/stages/advance", (request) =>
    completeProjectStage(
      context.database,
      idSchema.parse(request.params).id,
      completeProjectStageInputSchema.parse(request.body),
    ),
  )
  app.get("/api/projects/:id/ai", (request) =>
    getProjectAiSession(context.database, idSchema.parse(request.params).id),
  )
  app.post("/api/projects/:id/ai/start", (request) =>
    startProjectAiClarification(
      context.database,
      context.secretPath,
      idSchema.parse(request.params).id,
      projectAiStartInputSchema.parse(request.body ?? {}).mode,
    ),
  )
  app.post("/api/projects/:id/resume", (request) =>
    resumeProject(context.database, context.secretPath, idSchema.parse(request.params).id),
  )
  app.post("/api/projects/:id/ai/answer", (request) =>
    answerProjectAiClarification(
      context.database,
      context.secretPath,
      idSchema.parse(request.params).id,
      projectAiAnswerInputSchema.parse(request.body).answer,
    ),
  )
  app.post("/api/projects/:id/ai/apply", (request) =>
    applyProjectAiPlan(context.database, idSchema.parse(request.params).id),
  )
  app.post("/api/projects/:id/ai/feedback", (request) => {
    const feedback = projectAiFeedbackInputSchema.parse(request.body)
    return advanceProjectFromAiFeedback(
      context.database,
      context.secretPath,
      idSchema.parse(request.params).id,
      feedback.outcome,
      feedback.obstacle,
    )
  })
  app.post("/api/projects/:id/current-task/today", (request, reply) =>
    reply
      .code(201)
      .send(
        addAiProjectTaskToToday(
          context.database,
          idSchema.parse(request.params).id,
          localDateInputSchema.parse(request.body).localDate,
        ),
      ),
  )
  app.patch("/api/projects/:id", (request) =>
    updateProject(
      context.database,
      idSchema.parse(request.params).id,
      updateProjectInputSchema.parse(request.body),
    ),
  )
  app.delete("/api/projects/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    moveToTrash(context.database, "project", id, getProject(context.database, id).name, clock.now())
    return reply.code(204).send()
  })
}
