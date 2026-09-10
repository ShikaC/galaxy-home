import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { fingerprint } from "../services/planning/retrieval.js"

export function productSnapshot(database: DatabaseSync, includeRuns = false): string {
  const tables = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
  return fingerprint(
    tables.flatMap((row) => {
      const { name } = z.object({ name: z.string() }).parse(row)
      if (!includeRuns && name === "plan_runs") return []
      const quoted = `"${name.replaceAll('"', '""')}"`
      const rows = database.prepare(`SELECT * FROM ${quoted}`).all().map(fingerprint).sort()
      return [{ name, rows }]
    }),
  )
}
