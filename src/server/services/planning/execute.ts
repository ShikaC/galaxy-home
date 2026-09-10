import { randomUUID } from "node:crypto"
import { z } from "zod"
import { normalizedTaskTitle, type PlanRun, planDate } from "../../../shared/planning.js"
import type { AppContext } from "../../context.js"
import { getAppClock } from "../../context.js"
import { validateProposal } from "./proposal.js"
import { assertFreshContext } from "./retrieval.js"
import { PlanError, readPlan, savePlan, savePlanFailure } from "./store.js"

const taskRow = z.object({ id: z.string(), title: z.string() })
const countRow = z.object({ count: z.number() })
export function executePlan(context: AppContext, id: string): PlanRun {
  const { database } = context
  const started = performance.now()
  database.exec("BEGIN IMMEDIATE")
  let run: PlanRun | undefined
  try {
    run = readPlan(database, id)
    if (run.status === "succeeded") {
      database.exec("COMMIT")
      return run
    }
    if (
      run.status !== "awaiting_confirmation" &&
      !(run.status === "failed" && run.error?.code === "EXECUTION_FAILED")
    )
      throw new PlanError("PLAN_NOT_CONFIRMABLE", "此计划当前不能执行，请重新生成。")
    if (run.proposal === null) throw new PlanError("PLAN_NOT_CONFIRMABLE", "计划内容缺失。")
    const executingRun = run
    assertFreshContext(database, executingRun)
    const proposal = validateProposal(run.proposal, run)
    const activeItems = database
      .prepare(
        "SELECT id, title FROM items WHERE status = 'active' AND deleted_at IS NULL AND is_tutorial = 0 ORDER BY created_at, id",
      )
      .all()
      .map((row) => taskRow.parse(row))
    const now = getAppClock(context).now().toISOString()
    const results: PlanRun["results"] = []
    for (const task of proposal.tasks) {
      const existing =
        task.existingItemId === null
          ? activeItems.find(
              (item) => normalizedTaskTitle(item.title) === normalizedTaskTitle(task.title),
            )
          : activeItems.find((item) => item.id === task.existingItemId)
      const itemId = existing?.id ?? randomUUID()
      const localDate = planDate(executingRun.input.startDate, task.dayOffset)
      if (existing === undefined) {
        database
          .prepare(
            "INSERT INTO items (id, title, notes, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
          )
          .run(
            itemId,
            task.title,
            `${task.reason}\n预计 ${task.minutes} 分钟\n计划记录：${run.id}`,
            now,
            now,
          )
        activeItems.push({ id: itemId, title: task.title })
      }
      const count = countRow.parse(
        database
          .prepare(`SELECT COUNT(*) AS count FROM today_items t JOIN items i ON i.id = t.item_id
        WHERE t.local_date = ? AND t.is_secondary = 0 AND i.deleted_at IS NULL AND i.status = 'active'`)
          .get(localDate),
      ).count
      database
        .prepare(`INSERT INTO today_items (local_date, item_id, sort_order, is_focus, is_secondary)
        VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM today_items WHERE local_date = ?), 0, ?)
        ON CONFLICT(local_date, item_id) DO NOTHING`)
        .run(localDate, itemId, localDate, count >= 3 ? 1 : 0)
      const verified = z.object({ title: z.string(), is_secondary: z.number() }).parse(
        database
          .prepare(`SELECT i.title, t.is_secondary FROM items i JOIN today_items t ON i.id = t.item_id
        WHERE i.id = ? AND t.local_date = ? AND i.status = 'active' AND i.deleted_at IS NULL`)
          .get(itemId, localDate),
      )
      if (normalizedTaskTitle(verified.title) !== normalizedTaskTitle(task.title))
        throw new Error("Task verification failed")
      results.push({
        itemId,
        title: verified.title,
        localDate,
        minutes: task.minutes,
        disposition: existing === undefined ? "created" : "reused",
        secondary: verified.is_secondary === 1,
        verified: true,
      })
    }
    const completed = savePlan(database, {
      ...run,
      status: "succeeded",
      results,
      error: null,
      updatedAt: now,
      executionMs: Math.round(performance.now() - started),
    })
    database.exec("COMMIT")
    return completed
  } catch (error) {
    database.exec("ROLLBACK")
    if (run === undefined || (error instanceof PlanError && error.code === "PLAN_NOT_CONFIRMABLE"))
      throw error
    if (error instanceof PlanError) {
      savePlanFailure(database, run, {
        ...run,
        status: "failed",
        error: { code: error.code, message: error.message, retryable: false },
        updatedAt: getAppClock(context).now().toISOString(),
      })
      throw error
    }
    return savePlanFailure(database, run, {
      ...run,
      status: "failed",
      results: [],
      executionMs: Math.round(performance.now() - started),
      updatedAt: getAppClock(context).now().toISOString(),
      error: {
        code: "EXECUTION_FAILED",
        message: "执行未完成，所有本次改动已回滚。可以安全重试。",
        retryable: true,
      },
    })
  }
}
export function cancelPlan(context: AppContext, id: string): PlanRun {
  const { database } = context
  database.exec("BEGIN IMMEDIATE")
  try {
    const run = readPlan(database, id)
    if (run.status === "succeeded")
      throw new PlanError("PLAN_ALREADY_EXECUTED", "计划已经执行，可在任务列表中调整。")
    const cancelled = savePlan(database, {
      ...run,
      status: "cancelled",
      updatedAt: getAppClock(context).now().toISOString(),
    })
    database.exec("COMMIT")
    return cancelled
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
