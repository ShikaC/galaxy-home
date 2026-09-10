import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type PlanRun, planRunSchema } from "../../../shared/planning.js"

export class PlanError extends Error {
  readonly name = "PlanError"
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message)
  }
}
const rowSchema = z.object({ state_json: z.string() })
export function readPlan(database: DatabaseSync, id: string): PlanRun {
  const row = database.prepare("SELECT state_json FROM plan_runs WHERE id = ?").get(id)
  if (row === undefined) throw new PlanError("PLAN_NOT_FOUND", "计划不存在", 404)
  return planRunSchema.parse(JSON.parse(rowSchema.parse(row).state_json))
}
export function findPlan(database: DatabaseSync, id: string): PlanRun | null {
  const row = database.prepare("SELECT state_json FROM plan_runs WHERE id = ?").get(id)
  return row === undefined ? null : planRunSchema.parse(JSON.parse(rowSchema.parse(row).state_json))
}
export function claimPlan(database: DatabaseSync, run: PlanRun): boolean {
  const validated = planRunSchema.parse(run)
  return (
    database
      .prepare(
        "INSERT INTO plan_runs (id, state_json, created_at, updated_at, owner_pid, lease_until_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
      )
      .run(
        run.id,
        JSON.stringify(validated),
        run.createdAt,
        run.updatedAt,
        process.pid,
        Date.now() + 120_000,
      ).changes === 1
  )
}
export function savePlan(database: DatabaseSync, run: PlanRun): PlanRun {
  const validated = planRunSchema.parse(run)
  database
    .prepare(`INSERT INTO plan_runs (id, state_json, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .run(run.id, JSON.stringify(validated), run.createdAt, run.updatedAt)
  return validated
}
export function finishPlan(database: DatabaseSync, run: PlanRun): PlanRun {
  const validated = planRunSchema.parse(run)
  database
    .prepare(
      "UPDATE plan_runs SET state_json = ?, updated_at = ? WHERE id = ? AND owner_pid = ? AND json_extract(state_json, '$.status') = 'planning'",
    )
    .run(JSON.stringify(validated), run.updatedAt, run.id, process.pid)
  return readPlan(database, run.id)
}
export function renewPlanLease(database: DatabaseSync, id: string): void {
  database
    .prepare(
      "UPDATE plan_runs SET lease_until_ms = ? WHERE id = ? AND owner_pid = ? AND json_extract(state_json, '$.status') = 'planning'",
    )
    .run(Date.now() + 120_000, id, process.pid)
}
export function savePlanFailure(database: DatabaseSync, previous: PlanRun, next: PlanRun): PlanRun {
  const validated = planRunSchema.parse(next)
  database
    .prepare(
      "UPDATE plan_runs SET state_json = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND json_extract(state_json, '$.status') = ?",
    )
    .run(
      JSON.stringify(validated),
      next.updatedAt,
      previous.id,
      previous.updatedAt,
      previous.status,
    )
  return readPlan(database, previous.id)
}
export function listPlans(database: DatabaseSync): PlanRun[] {
  recoverInterruptedPlans(database)
  return database
    .prepare("SELECT state_json FROM plan_runs ORDER BY created_at DESC, id DESC LIMIT 100")
    .all()
    .map((row) => planRunSchema.parse(JSON.parse(rowSchema.parse(row).state_json)))
}
export function recoverInterruptedPlans(database: DatabaseSync): void {
  const rows = database
    .prepare(
      "SELECT state_json, owner_pid, lease_until_ms FROM plan_runs WHERE json_extract(state_json, '$.status') = 'planning'",
    )
    .all()
  for (const row of rows) {
    const owner = z.object({ owner_pid: z.number(), lease_until_ms: z.number() }).parse(row)
    let alive = false
    if (owner.owner_pid > 0 && owner.lease_until_ms > Date.now()) {
      try {
        process.kill(owner.owner_pid, 0)
        alive = true
      } catch {
        alive = false
      }
    }
    if (alive) continue
    const run = planRunSchema.parse(JSON.parse(rowSchema.parse(row).state_json))
    const interrupted: PlanRun = {
      ...run,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: {
        code: "INTERRUPTED",
        message: "上次生成在服务重启时中断，可以重新生成。没有任务被写入。",
        retryable: true,
      },
    }
    database
      .prepare(
        "UPDATE plan_runs SET state_json = ?, updated_at = ? WHERE id = ? AND json_extract(state_json, '$.status') = 'planning' AND owner_pid = ? AND lease_until_ms = ?",
      )
      .run(
        JSON.stringify(interrupted),
        interrupted.updatedAt,
        run.id,
        owner.owner_pid,
        owner.lease_until_ms,
      )
  }
}
