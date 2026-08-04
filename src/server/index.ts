import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { buildApp } from "./app.js"
import { migrateDatabase, openDatabase } from "./database.js"
import { getSettings } from "./repositories/settings.js"
import { ensureDailyBackup } from "./services/backup.js"
import { runScheduler } from "./services/scheduler.js"

const dataDirectory = resolve(process.env["GALAXY_DATA_DIR"] ?? resolve(process.cwd(), "data"))
const backupDirectory = resolve(dataDirectory, "backups")
mkdirSync(dataDirectory, { recursive: true })
const database = openDatabase(resolve(dataDirectory, "galaxy-home.sqlite"))
migrateDatabase(database)
const settings = getSettings(database)
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(
  new Date(),
)
await ensureDailyBackup(database, backupDirectory, localDate, settings.backupRetentionDays)
runScheduler(database)

const production = process.env["NODE_ENV"] === "production"
const port = Number(process.env[production ? "PORT" : "API_PORT"] ?? (production ? 4173 : 3001))
const app = await buildApp(
  {
    database,
    dataDirectory,
    backupDirectory,
    secretPath: resolve(dataDirectory, "secrets.json"),
  },
  production,
)
app.addHook("onClose", () => database.close())

try {
  await app.listen({ host: "127.0.0.1", port })
} catch (error) {
  app.log.error(error)
  database.close()
  process.exitCode = 1
}
