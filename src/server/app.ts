import { resolve } from "node:path"
import multipart from "@fastify/multipart"
import staticPlugin from "@fastify/static"
import Fastify from "fastify"
import { ERROR_CODES } from "../shared/errorCodes.js"
import type { AppContext } from "./context.js"
import { toErrorResponse } from "./errorResponses.js"
import { registerAiRoutes } from "./routes/ai.js"
import { registerCalendarRoutes } from "./routes/calendar.js"
import { registerContentRoutes } from "./routes/content.js"
import { registerDomainRoutes } from "./routes/domain.js"
import { registerItemRoutes } from "./routes/items.js"
import { registerNoteRoutes } from "./routes/notes.js"
import { registerSystemRoutes } from "./routes/system.js"
import { registerTaskPlanningRoutes } from "./routes/taskPlanning.js"
import { registerTaskSeriesRoutes } from "./routes/taskSeries.js"

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

  app.setErrorHandler((error, request, reply) => {
    const mapped = toErrorResponse(error)
    if (mapped === null) {
      app.log.error(error)
      return reply.code(500).send({ code: ERROR_CODES.INTERNAL_ERROR, message: "服务暂时不可用" })
    }
    if (mapped.log !== undefined)
      request.log.error({ code: mapped.body.code, message: mapped.body.message }, mapped.log)
    return reply.code(mapped.status).send(mapped.body)
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
