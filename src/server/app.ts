import { resolve } from "node:path"
import multipart from "@fastify/multipart"
import staticPlugin from "@fastify/static"
import Fastify from "fastify"
import { ZodError } from "zod"
import { ERROR_CODES } from "../shared/errorCodes.js"
import { RecurrenceLocalTimeError } from "../shared/recurrence.js"
import type { AppContext } from "./context.js"
import { AiActionUnavailableError } from "./repositories/aiActions.js"
import { HabitRestDayError } from "./repositories/habitLogs.js"
import { ProjectAiPlanStaleError, ProjectAiSessionNotFoundError } from "./repositories/projectAi.js"
import { ProjectTaskNotRecommendedError } from "./repositories/projectRecommendations.js"
import { ReviewSuggestionUnavailableError } from "./repositories/reviewSuggestions.js"
import {
  ItemCreateRequestConflictError,
  ItemHasOpenSubtasksError,
  ItemNotFoundError,
  ItemParentConflictError,
  ItemVersionConflictError,
} from "./repositories/taskErrors.js"
import { TaskSeriesNotFoundError } from "./repositories/taskSeries.js"
import { registerAiRoutes } from "./routes/ai.js"
import { registerCalendarRoutes } from "./routes/calendar.js"
import { registerContentRoutes } from "./routes/content.js"
import { registerDomainRoutes } from "./routes/domain.js"
import { registerItemRoutes } from "./routes/items.js"
import { registerNoteRoutes } from "./routes/notes.js"
import { registerSystemRoutes } from "./routes/system.js"
import { registerTaskPlanningRoutes } from "./routes/taskPlanning.js"
import { registerTaskSeriesRoutes } from "./routes/taskSeries.js"
import { AiServiceError } from "./services/ai.js"
import { AiInvalidEndpointError } from "./services/aiEndpoint.js"
import { AiConfirmationRequiredError } from "./services/aiReview.js"
import {
  ImportArchiveInvalidError,
  ImportArchiveMalformedError,
  ImportArchiveTooLargeError,
} from "./services/backup.js"
import {
  OccurrenceRequiredError,
  ItemVersionConflictError as RecurrenceItemVersionConflictError,
  RecurrenceRequestConflictError,
  SeriesVersionConflictError,
  TaskSeriesRelationNotFoundError,
} from "./services/recurrence.js"
import { TaskPlanError } from "./services/taskPlanning/store.js"

function localBrowserOrigins(production: boolean): ReadonlySet<string> {
  const defaultPort = production ? "4173" : "5173"
  const port = process.env[production ? "PORT" : "VITE_PORT"] ?? defaultPort
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`])
}

function normalizeBrowserOrigin(origin: string): string | null {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return null
  }
  return url.protocol === "http:" ? url.origin : null
}

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])
const capabilityCookieName = "galaxy_capability"
const environment = process.env as NodeJS.ProcessEnv & {
  readonly GALAXY_REQUIRE_ORIGIN?: string
}

function requestPath(url: string): string {
  return new URL(url, "http://127.0.0.1").pathname
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0]
}

function hasCapabilityCookie(cookieHeader: string | undefined, capability: string): boolean {
  return (
    cookieHeader
      ?.split(";")
      .some((part) => part.trim() === `${capabilityCookieName}=${capability}`) ?? false
  )
}

function capabilityCookie(capability: string): string {
  return `${capabilityCookieName}=${capability}; HttpOnly; Path=/; SameSite=Strict`
}

export async function buildApp(context: AppContext, production = false) {
  const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 })
  const allowedOrigins = localBrowserOrigins(production)
  const requireOrigin = production || environment.GALAXY_REQUIRE_ORIGIN === "1"
  const apiCapability = context.apiCapability
  app.addHook("onRequest", (request, reply, done) => {
    const path = requestPath(request.url)
    const origin = request.headers.origin
    const capabilityHeader = headerValue(request.headers["x-galaxy-capability"])
    const isSessionBootstrap =
      apiCapability !== undefined && path === "/api/session" && capabilityHeader === apiCapability
    const hasCapability =
      apiCapability !== undefined && hasCapabilityCookie(request.headers.cookie, apiCapability)
    if (
      (requireOrigin &&
        stateChangingMethods.has(request.method) &&
        origin === undefined &&
        !hasCapability &&
        !isSessionBootstrap) ||
      (origin !== undefined && !allowedOrigins.has(normalizeBrowserOrigin(origin) ?? ""))
    ) {
      reply
        .code(403)
        .send({ code: ERROR_CODES.ORIGIN_NOT_ALLOWED, message: "只允许本机页面访问此服务" })
      return
    }
    if (isSessionBootstrap) {
      reply.code(204).header("set-cookie", capabilityCookie(apiCapability)).send()
      return
    }
    if (
      apiCapability !== undefined &&
      path.startsWith("/api/") &&
      path !== "/api/health" &&
      !hasCapability
    ) {
      reply.code(401).send({
        code: ERROR_CODES.API_CAPABILITY_REQUIRED,
        message: "桌面会话已失效，请重新打开应用",
      })
      return
    }
    done()
  })
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
  registerTaskSeriesRoutes(app, context)
  registerCalendarRoutes(app, context)
  registerTaskPlanningRoutes(app, context)
  registerDomainRoutes(app, context)
  registerContentRoutes(app, context)
  registerNoteRoutes(app, context)
  registerAiRoutes(app, context)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: error.issues[0]?.message ?? "输入内容无效",
      })
    }
    if (error instanceof ItemVersionConflictError)
      return reply.code(409).send({
        code: ERROR_CODES.ITEM_VERSION_CONFLICT,
        entityId: error.itemId,
        currentVersion: error.currentVersion,
        message: error.message,
      })
    if (error instanceof ItemCreateRequestConflictError)
      return reply.code(409).send({
        code: ERROR_CODES.ITEM_CREATE_REQUEST_CONFLICT,
        entityId: error.requestId,
        message: error.message,
      })
    if (error instanceof ItemParentConflictError)
      return reply.code(409).send({
        code: ERROR_CODES.ITEM_PARENT_CONFLICT,
        entityId: error.itemId,
        message: error.message,
      })
    if (error instanceof ItemHasOpenSubtasksError)
      return reply.code(409).send({
        code: ERROR_CODES.ITEM_HAS_OPEN_SUBTASKS,
        entityId: error.itemId,
        message: error.message,
      })
    if (error instanceof ItemNotFoundError)
      return reply
        .code(404)
        .send({ code: ERROR_CODES.ITEM_NOT_FOUND, entityId: error.itemId, message: error.message })
    if (error instanceof SeriesVersionConflictError)
      return reply.code(409).send({
        code: error.code,
        entityId: error.entityId,
        currentVersion: error.currentVersion,
        message: error.message,
      })
    if (error instanceof RecurrenceRequestConflictError)
      return reply
        .code(409)
        .send({ code: error.code, entityId: error.entityId, message: error.message })
    if (error instanceof TaskSeriesRelationNotFoundError)
      return reply
        .code(409)
        .send({ code: error.code, entityId: error.entityId, message: error.message })
    if (error instanceof RecurrenceItemVersionConflictError)
      return reply.code(409).send({
        code: error.code,
        entityId: error.entityId,
        currentVersion: error.currentVersion,
        message: error.message,
      })
    if (error instanceof OccurrenceRequiredError)
      return reply
        .code(409)
        .send({ code: error.code, entityId: error.itemId, message: error.message })
    if (error instanceof TaskSeriesNotFoundError)
      return reply.code(404).send({
        code: ERROR_CODES.TASK_SERIES_NOT_FOUND,
        entityId: error.seriesId,
        message: error.message,
      })
    if (error instanceof RecurrenceLocalTimeError)
      return reply
        .code(400)
        .send({ code: ERROR_CODES.RECURRENCE_LOCAL_TIME_INVALID, message: error.message })
    if (error instanceof TaskPlanError)
      return reply.code(error.statusCode).send({ code: error.code, message: error.message })
    if (error instanceof HabitRestDayError)
      return reply.code(409).send({ code: ERROR_CODES.HABIT_REST_DAY, message: error.message })
    if (error instanceof ProjectAiPlanStaleError)
      return reply.code(409).send({ code: ERROR_CODES.PROJECT_AI_STALE, message: error.message })
    if (error instanceof ProjectAiSessionNotFoundError)
      return reply
        .code(409)
        .send({ code: ERROR_CODES.PROJECT_AI_SESSION_MISSING, message: error.message })
    if (error instanceof ProjectTaskNotRecommendedError)
      return reply
        .code(409)
        .send({ code: ERROR_CODES.PROJECT_TASK_NOT_RECOMMENDED, message: error.message })
    if (error instanceof ReviewSuggestionUnavailableError)
      return reply
        .code(409)
        .send({ code: ERROR_CODES.REVIEW_SUGGESTION_UNAVAILABLE, message: error.message })
    if (error instanceof AiConfirmationRequiredError)
      return reply
        .code(409)
        .send({ code: ERROR_CODES.AI_CONFIRMATION_REQUIRED, message: error.message })
    if (error instanceof AiActionUnavailableError)
      return reply
        .code(409)
        .send({ code: ERROR_CODES.AI_ACTION_UNAVAILABLE, message: error.message })
    if (error instanceof ImportArchiveTooLargeError)
      return reply
        .code(413)
        .send({ code: ERROR_CODES.IMPORT_ARCHIVE_TOO_LARGE, message: error.message })
    if (error instanceof ImportArchiveMalformedError)
      return reply
        .code(400)
        .send({ code: ERROR_CODES.IMPORT_ARCHIVE_INVALID, message: error.message })
    if (error instanceof ImportArchiveInvalidError)
      return reply
        .code(400)
        .send({ code: ERROR_CODES.IMPORT_ARCHIVE_INVALID, message: "导入文件字段无效" })
    if (error instanceof AiInvalidEndpointError)
      return reply.code(400).send({ code: error.code, message: error.message })
    if (error instanceof AiServiceError) {
      _request.log.error({ code: error.code, message: error.message }, "ai.request.failed")
      return reply.code(503).send({ code: error.code, message: error.message })
    }
    app.log.error(error)
    return reply.code(500).send({ code: ERROR_CODES.INTERNAL_ERROR, message: "服务暂时不可用" })
  })

  if (production) {
    await app.register(staticPlugin, { root: resolve(process.cwd(), "dist/client") })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/"))
        return reply.code(404).send({ code: ERROR_CODES.NOT_FOUND, message: "接口不存在" })
      return reply.sendFile("index.html")
    })
  }
  return app
}
