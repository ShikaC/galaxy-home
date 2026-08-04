import type { DatabaseSync } from "node:sqlite"

export type AppContext = {
  readonly database: DatabaseSync
  readonly dataDirectory: string
  readonly backupDirectory: string
  readonly secretPath: string
}
