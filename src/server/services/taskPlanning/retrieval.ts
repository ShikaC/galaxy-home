// 从原 planning 服务迁移而来：为 plan 模式检索工作区笔记与可复用的活动任务。
// 术语表（terms）与指纹（fingerprint）用于构造提示词、校验引用、以及确认前的上下文新鲜度检查。
import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { PlanSource, TaskPlanRun } from "../../../shared/taskPlanning.js"
import { getSettings } from "../../repositories/settings.js"
import { TaskPlanError } from "./store.js"

export type PlanModeInput = Extract<TaskPlanRun["input"], { readonly type: "plan" }>

export const fingerprint = (value: unknown): string =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, entry: unknown) =>
        entry !== null && typeof entry === "object" && !Array.isArray(entry)
          ? Object.fromEntries(
              Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
            )
          : entry,
      ),
    )
    .digest("hex")

export function terms(text: string): readonly string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? []
  return [
    ...new Set(
      words.flatMap((word) =>
        /^[a-z0-9]+$/.test(word) || word.length < 2
          ? [word]
          : Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2)),
      ),
    ),
  ]
    .filter(
      (word) =>
        ![
          "根据",
          "帮我",
          "今天",
          "最近",
          "安排",
          "计划",
          "一下",
          "关于",
          "完成",
          "需要",
          "时间",
          "分钟",
          "的",
          "我",
        ].includes(word),
    )
    .slice(0, 80)
}

const noteRow = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  archived: z.number(),
})
const itemRow = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.string(),
  deleted_at: z.string().nullable(),
})

export function assertContextPermission(database: DatabaseSync, input: PlanModeInput): void {
  if (input.contextMode === "workspace" && getSettings(database).aiPermission !== "open")
    throw new TaskPlanError(
      "TASK_PLAN_CONTEXT_PERMISSION",
      "请先在设置中开启开放模式，或仅根据本次输入生成计划。",
    )
}

export function retrieveSources(database: DatabaseSync, goal: string): PlanSource[] {
  const query = terms(goal)
  if (query.length === 0) return []
  const where = query
    .map(() => "(instr(lower(title), ?) > 0 OR instr(lower(content), ?) > 0)")
    .join(" OR ")
  const rows = database
    .prepare(
      `SELECT id, title, content, archived FROM workspace_notes WHERE archived = 0 AND (${where})`,
    )
    .all(...query.flatMap((term) => [term, term]))
  return rows
    .map((raw) => {
      const row = noteRow.parse(raw)
      const title = row.title.toLowerCase()
      const content = row.content.toLowerCase()
      const score =
        query.reduce(
          (sum, term) => sum + (title.includes(term) ? 4 : 0) + (content.includes(term) ? 1 : 0),
          0,
        ) / query.length
      const firstMatch = Math.min(
        ...query.map((term) => content.indexOf(term)).filter((index) => index >= 0),
      )
      const start = Number.isFinite(firstMatch) ? Math.max(0, firstMatch - 300) : 0
      return {
        id: row.id,
        title: row.title,
        excerpt: row.content.slice(start, start + 3000),
        fingerprint: fingerprint(row),
        score,
      }
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 6)
}

export function retrieveContext(
  database: DatabaseSync,
  input: PlanModeInput,
): Pick<TaskPlanRun, "sources" | "existingItems"> {
  assertContextPermission(database, input)
  if (input.contextMode === "goal_only") return { sources: [], existingItems: [] }
  const query = terms(input.goal)
  const items = database
    .prepare(
      "SELECT id, title, notes, status, deleted_at FROM items WHERE status = 'active' AND deleted_at IS NULL AND is_tutorial = 0",
    )
    .all()
    .map((row) => itemRow.parse(row))
  items.sort(
    (a, b) =>
      query.filter((term) => b.title.toLowerCase().includes(term)).length -
        query.filter((term) => a.title.toLowerCase().includes(term)).length ||
      a.id.localeCompare(b.id),
  )
  return {
    sources: retrieveSources(database, input.goal),
    existingItems: items
      .slice(0, 80)
      .map((row) => ({ id: row.id, title: row.title, fingerprint: fingerprint(row) })),
  }
}

// 确认前复核：作为依据的笔记或待复用的任务若已变化，整批执行应中止而不是写入过期计划。
export function assertFreshContext(database: DatabaseSync, run: TaskPlanRun): void {
  if (run.input.type !== "plan") return
  assertContextPermission(database, run.input)
  for (const source of run.sources) {
    const row = database
      .prepare("SELECT id, title, content, archived FROM workspace_notes WHERE id = ?")
      .get(source.id)
    if (row === undefined || fingerprint(noteRow.parse(row)) !== source.fingerprint)
      throw new TaskPlanError("TASK_PLAN_STALE", "作为依据的笔记已更新或归档，请重新生成计划。")
  }
  const tasks = run.proposal?.kind === "plan" ? run.proposal.tasks : []
  for (const task of tasks) {
    if (task.existingItemId === null) continue
    const previous = run.existingItems.find((item) => item.id === task.existingItemId)
    const row = database
      .prepare("SELECT id, title, notes, status, deleted_at FROM items WHERE id = ?")
      .get(task.existingItemId)
    if (row === undefined || fingerprint(itemRow.parse(row)) !== previous?.fingerprint)
      throw new TaskPlanError("TASK_PLAN_STALE", "计划引用的任务已发生变化，请重新生成计划。")
  }
}
