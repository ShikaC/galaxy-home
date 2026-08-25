import { randomBytes } from "node:crypto"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { buildApp } from "./app.js"
import { migrateDatabase, openDatabase } from "./database.js"
import { watchParentLifetime } from "./parentLifetime.js"
import { getSettings } from "./repositories/settings.js"
import { purgeExpiredTrash } from "./repositories/trash.js"
import { ensureDailyBackup } from "./services/backup.js"
import type { Clock } from "./services/clock.js"
import { systemClock } from "./services/clock.js"
import { maybeGenerateScheduledAiWeeklyReview } from "./services/scheduledAiReview.js"
import { runScheduler } from "./services/scheduler.js"
import { getAiConfigStatus } from "./services/secrets.js"
import { serverExitCode } from "./startup.js"

const environment = process.env as Pick<
  NodeJS.ProcessEnv,
  "GALAXY_CLOCK_NOW" | "GALAXY_DATA_DIR" | "GALAXY_PARENT_LIFETIME" | "NODE_ENV"
>

function resolveClock(): Clock {
  const fixed = environment.GALAXY_CLOCK_NOW
  if (fixed === undefined || fixed.trim() === "") return systemClock
  const instant = new Date(fixed)
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`GALAXY_CLOCK_NOW 不是合法时间：${fixed}`)
  }
  return { now: () => new Date(instant.getTime()) }
}

const clock = resolveClock()
const apiCapability =
  environment.GALAXY_PARENT_LIFETIME === "1" ? randomBytes(32).toString("base64url") : undefined
const dataDirectory = resolve(environment.GALAXY_DATA_DIR ?? resolve(process.cwd(), "data"))
const backupDirectory = resolve(dataDirectory, "backups")
mkdirSync(dataDirectory, { recursive: true })
const database = openDatabase(resolve(dataDirectory, "galaxy-home.sqlite"))
migrateDatabase(database)
const settings = getSettings(database)
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(
  clock.now(),
)
await ensureDailyBackup(database, backupDirectory, localDate, settings.backupRetentionDays)
purgeExpiredTrash(database)
const secretPath = resolve(dataDirectory, "secrets.json")
const deferAiReview =
  getSettings(database).aiPermission === "open" && getAiConfigStatus(secretPath).configured
runScheduler(database, clock.now(), { deferAiReview })
if (deferAiReview) {
  try {
    await maybeGenerateScheduledAiWeeklyReview(database, secretPath, clock.now())
  } catch {
    runScheduler(database, clock.now(), { deferAiReview: false })
  }
}

const production = environment.NODE_ENV === "production"
const port = Number(process.env[production ? "PORT" : "API_PORT"] ?? (production ? 4173 : 3001))
const context = {
  database,
  dataDirectory,
  backupDirectory,
  secretPath,
  clock,
  ...(apiCapability === undefined ? {} : { apiCapability }),
}
const app = await buildApp(context, production)
app.addHook("onClose", () => database.close())

try {
  await app.listen({ host: "127.0.0.1", port })
  if (environment.GALAXY_PARENT_LIFETIME === "1") {
    const address = app.server.address()
    if (address === null || typeof address === "string")
      throw new Error("银河居所服务未返回有效监听端口")
    process.stdout.write(`GALAXY_HOME_READY ${address.port} ${apiCapability ?? ""}\n`)
    process.stdout.end()
  }
  watchParentLifetime(environment.GALAXY_PARENT_LIFETIME === "1", process.stdin, () => app.close())
} catch (error) {
  app.log.error(error)
  database.close()
  process.exitCode = serverExitCode(error)
}
