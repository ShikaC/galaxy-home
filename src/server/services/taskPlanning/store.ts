import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  type TaskPlanInput,
  type TaskPlanRun,
  taskPlanRunSchema,
} from "../../../shared/taskPlanning.js"

const rowSchema = z.strictObject({ state_json: z.string() })
const leaseRowSchema = z.strictObject({
  state_json: z.string(),
  owner_pid: z.number().nullable(),
  lease_until_ms: z.number().nullable(),
})

export class TaskPlanError extends Error {
  readonly name = "TaskPlanError"
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message)
  }
}

export function taskPlanInputFingerprint(input: TaskPlanInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function findTaskPlan(database: DatabaseSync, id: string): TaskPlanRun | null {
  const row = database.prepare("SELECT state_json FROM task_plan_runs WHERE id = ?").get(id)
  return row === undefined
    ? null
    : taskPlanRunSchema.parse(JSON.parse(rowSchema.parse(row).state_json))
}

export function readTaskPlan(database: DatabaseSync, id: string): TaskPlanRun {
  const run = findTaskPlan(database, id)
  if (run === null) throw new TaskPlanError("TASK_PLAN_NOT_FOUND", "任务计划不存在", 404)
  return run
}

export function claimTaskPlan(database: DatabaseSync, run: TaskPlanRun): boolean {
  const parsed = taskPlanRunSchema.parse(run)
  return (
    database
      .prepare(`INSERT INTO task_plan_runs
    (id, state_json, created_at, updated_at, owner_pid, lease_until_ms)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
      .run(
        run.id,
        JSON.stringify(parsed),
        run.createdAt,
        run.updatedAt,
        process.pid,
        Date.now() + 120_000,
      ).changes === 1
  )
}

export function saveTaskPlan(database: DatabaseSync, run: TaskPlanRun): TaskPlanRun {
  const parsed = taskPlanRunSchema.parse(run)
  database
    .prepare("UPDATE task_plan_runs SET state_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(parsed), run.updatedAt, run.id)
  return parsed
}

export function finishTaskPlan(database: DatabaseSync, run: TaskPlanRun): TaskPlanRun {
  const parsed = taskPlanRunSchema.parse(run)
  database
    .prepare(`UPDATE task_plan_runs SET state_json = ?, updated_at = ?, owner_pid = NULL,
    lease_until_ms = NULL WHERE id = ? AND owner_pid = ?
    AND json_extract(state_json, '$.status') = 'planning'`)
    .run(JSON.stringify(parsed), run.updatedAt, run.id, process.pid)
  return readTaskPlan(database, run.id)
}

export function renewTaskPlanLease(database: DatabaseSync, id: string): void {
  database
    .prepare(`UPDATE task_plan_runs SET lease_until_ms = ? WHERE id = ? AND owner_pid = ?
    AND json_extract(state_json, '$.status') = 'planning'`)
    .run(Date.now() + 120_000, id, process.pid)
}

export function listTaskPlans(database: DatabaseSync): readonly TaskPlanRun[] {
  recoverTaskPlans(database)
  return database
    .prepare("SELECT state_json FROM task_plan_runs ORDER BY created_at DESC, id DESC LIMIT 100")
    .all()
    .map((row) => taskPlanRunSchema.parse(JSON.parse(rowSchema.parse(row).state_json)))
}

export function recoverTaskPlans(database: DatabaseSync): void {
  for (const raw of database
    .prepare(`SELECT state_json, owner_pid, lease_until_ms FROM task_plan_runs
    WHERE json_extract(state_json, '$.status') = 'planning'`)
    .all()) {
    const row = leaseRowSchema.parse(raw)
    if (row.owner_pid !== null && row.lease_until_ms !== null && row.lease_until_ms > Date.now()) {
      try {
        process.kill(row.owner_pid, 0)
        continue
      } catch {
        /* expired owner */
      }
    }
    const run = taskPlanRunSchema.parse(JSON.parse(row.state_json))
    const next = taskPlanRunSchema.parse({
      ...run,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: {
        code: "INTERRUPTED",
        message: "生成在服务重启时中断，可以用相同请求重新查看或新请求重试。",
        retryable: true,
      },
    })
    database
      .prepare(`UPDATE task_plan_runs SET state_json = ?, updated_at = ?, owner_pid = NULL,
      lease_until_ms = NULL WHERE id = ? AND json_extract(state_json, '$.status') = 'planning'
      AND owner_pid IS ? AND lease_until_ms IS ?`)
      .run(JSON.stringify(next), next.updatedAt, run.id, row.owner_pid, row.lease_until_ms)
  }
}
