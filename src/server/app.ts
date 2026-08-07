import { resolve } from "node:path"
import multipart from "@fastify/multipart"
import staticPlugin from "@fastify/static"
import Fastify from "fastify"
import { ZodError } from "zod"
import type { AppContext } from "./context.js"
import { AiActionUnavailableError } from "./repositories/aiActions.js"
import { ProjectAiPlanStaleError, ProjectAiSessionNotFoundError } from "./repositories/projectAi.js"
import { ProjectTaskNotRecommendedError } from "./repositories/projectRecommendations.js"
import { ReviewSuggestionUnavailableError } from "./repositories/reviewSuggestions.js"
import { HabitRestDayError } from "./repositories/habitLogs.js"
import { TodayLimitError } from "./repositories/todayItems.js"
import { registerAiRoutes } from "./routes/ai.js"
import { registerContentRoutes } from "./routes/content.js"
import { registerDomainRoutes } from "./routes/domain.js"
import { registerItemRoutes } from "./routes/items.js"
import { registerSystemRoutes } from "./routes/system.js"
import { AiServiceError } from "./services/ai.js"
import { AiInvalidEndpointError } from "./services/aiEndpoint.js"
import { AiConfirmationRequiredError } from "./services/aiReview.js"
import { ImportArchiveInvalidError, ImportArchiveTooLargeError } from "./services/backup.js"

export async function buildApp(context: AppContext, production = false) {
  const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 })
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } })
  app.addContentTypeParser("application/zip", { parseAs: "buffer" }, (_request, body, done) =>
    done(null, body),
  )
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  )
  app.get("/api/health", () => ({ status: "ok" }))
  registerSystemRoutes(app, context)
  registerItemRoutes(app, context)
  registerDomainRoutes(app, context)
  registerContentRoutes(app, context)
  registerAiRoutes(app, context)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "输入内容无效" })
    }
    if (error instanceof TodayLimitError)
      return reply.code(409).send({ code: "TODAY_LIMIT", message: error.message })
    if (error instanceof HabitRestDayError)
      return reply.code(409).send({ code: "HABIT_REST_DAY", message: error.message })
    if (error instanceof ProjectAiPlanStaleError)
      return reply.code(409).send({ code: "PROJECT_AI_STALE", message: error.message })
    if (error instanceof ProjectAiSessionNotFoundError)
      return reply.code(409).send({ code: "PROJECT_AI_SESSION_MISSING", message: error.message })
    if (error instanceof ProjectTaskNotRecommendedError)
      return reply.code(409).send({ code: "PROJECT_TASK_NOT_RECOMMENDED", message: error.message })
    if (error instanceof ReviewSuggestionUnavailableError)
      return reply.code(409).send({ code: "REVIEW_SUGGESTION_UNAVAILABLE", message: error.message })
    if (error instanceof AiConfirmationRequiredError)
      return reply.code(409).send({ code: "AI_CONFIRMATION_REQUIRED", message: error.message })
    if (error instanceof AiActionUnavailableError)
      return reply.code(409).send({ code: "AI_ACTION_UNAVAILABLE", message: error.message })
    if (error instanceof ImportArchiveTooLargeError)
      return reply.code(413).send({ code: "IMPORT_ARCHIVE_TOO_LARGE", message: error.message })
    if (error instanceof ImportArchiveInvalidError)
      return reply.code(400).send({ code: "IMPORT_ARCHIVE_INVALID", message: "导入文件字段无效" })
    if (error instanceof AiInvalidEndpointError)
      return reply.code(400).send({ code: error.code, message: error.message })
    if (error instanceof AiServiceError)
      return reply.code(503).send({ code: error.code, message: error.message })
    app.log.error(error)
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "服务暂时不可用" })
  })

  if (production) {
    await app.register(staticPlugin, { root: resolve(process.cwd(), "dist/client") })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/"))
        return reply.code(404).send({ code: "NOT_FOUND", message: "接口不存在" })
      return reply.sendFile("index.html")
    })
  }
  return app
}
