import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { fingerprint } from "../services/taskPlanning/retrieval.js"

export function productSnapshot(database: DatabaseSync, includeRuns = false): string {
  const tables = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
  return fingerprint(
    tables.flatMap((row) => {
      const { name } = z.object({ name: z.string() }).parse(row)
      // 运行记录表不计入产品状态：生成阶段本来就会写 run，确认前的“无写入”
      // 指的是业务数据（任务、今日、笔记）没被动过。两代表名都要排除。
      if (!includeRuns && (name === "task_plan_runs" || name === "plan_runs")) return []
      const quoted = `"${name.replaceAll('"', '""')}"`
      const rows = database.prepare(`SELECT * FROM ${quoted}`).all().map(fingerprint).sort()
      return [{ name, rows }]
    }),
  )
}
