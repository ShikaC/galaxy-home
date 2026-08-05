import type { DatabaseSync } from "node:sqlite"
import { type Clock, systemClock } from "./services/clock.js"

export type AppContext = {
  readonly database: DatabaseSync
  readonly dataDirectory: string
  readonly backupDirectory: string
  readonly secretPath: string
  readonly clock?: Clock
}

export function getAppClock(context: AppContext): Clock {
  return context.clock ?? systemClock
}
