import { z } from "zod"
import { occurrenceDates } from "../../../shared/recurrence.js"
import { normalizedTaskTitle, planDate, type TaskPlanRun } from "../../../shared/taskPlanning.js"
import type { AppContext } from "../../context.js"
import { getAppClock } from "../../context.js"
import { createItem, getItem, updateItem } from "../../repositories/items.js"
import { getSettings } from "../../repositories/settings.js"
import { getTaskSeries } from "../../repositories/taskSeries.js"
import { setTodayItem } from "../../repositories/todayItems.js"
import { withImmediateTransaction } from "../../repositories/transaction.js"
import { buildCalendarSnapshot } from "../calendar.js"
import { createTaskSeries } from "../recurrence.js"
import { shiftCalendarDate } from "../time.js"
import { assertFreshContext } from "./retrieval.js"
import { readTaskPlan, saveTaskPlan, TaskPlanError } from "./store.js"
import { assertConfirmable, deriveReplanProposal } from "./validate.js"

const taskRow = z.object({ id: z.string().uuid().brand("ItemId"), title: z.string() })

export function confirmTaskPlan(
  context: AppContext,
  id: string,
  expectedRevision: number,
): TaskPlanRun {
  return withImmediateTransaction(context.database, () => {
    const run = readTaskPlan(context.database, id)
    if (run.status === "succeeded") return run
    if (run.status !== "awaiting_confirmation" || run.proposal === null)
      throw new TaskPlanError("TASK_PLAN_NOT_CONFIRMABLE", "当前任务计划不可确认")
    if (run.draftRevision !== expectedRevision)
      throw new TaskPlanError("TASK_PLAN_REVISION_CONFLICT", "任务计划已更新")
    const clock = getAppClock(context)
    const instant = clock.now()
    const started = performance.now()
    const results: TaskPlanRun["results"][number][] = []
    if (run.proposal.kind === "capture" && run.input.type === "capture") {
      if (run.proposal.ambiguities.length > 0)
        throw new TaskPlanError("TASK_PLAN_BLOCKED", "请先处理计划中的歧义")
      for (const draft of run.proposal.tasks) {
        const item = createItem(
          context.database,
          {
            requestId: draft.draftId,
            title: draft.title,
            priority: draft.priority,
            isFixed: false,
            categoryIds: [],
            projectIds: [],
            ...(draft.notes === null ? {} : { notes: draft.notes }),
            ...(draft.dueDate === null ? {} : { dueDate: draft.dueDate }),
            ...(draft.estimatedMinutes === null
              ? {}
              : { estimatedMinutes: draft.estimatedMinutes }),
          },
          run.input.referenceDate,
          instant,
        )
        if (
          item.title !== draft.title ||
          item.notes !== draft.notes ||
          item.priority !== draft.priority ||
          item.dueDate !== draft.dueDate ||
          item.estimatedMinutes !== draft.estimatedMinutes ||
          item.isFixed
        )
          throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "任务写入核验失败")
        results.push({ kind: "item", id: item.id, verified: true })
      }
      for (const draft of run.proposal.series) {
        const series = createTaskSeries(
          context.database,
          {
            requestId: draft.draftId,
            title: draft.title,
            notes: draft.notes,
            priority: draft.priority,
            categoryIds: [],
            projectIds: [],
            timezone: draft.timezone,
            startDate: draft.startDate,
            rule: draft.rule,
            estimatedMinutes: draft.estimatedMinutes,
            dueTime: draft.dueTime,
            reminderMinutes: null,
            reminders: [],
          },
          run.input.referenceDate,
          instant,
        )
        if (
          series.title !== draft.title ||
          series.notes !== draft.notes ||
          series.priority !== draft.priority ||
          series.timezone !== draft.timezone ||
          series.startDate !== draft.startDate ||
          JSON.stringify(series.rule) !== JSON.stringify(draft.rule) ||
          series.estimatedMinutes !== draft.estimatedMinutes ||
          series.dueTime !== draft.dueTime ||
          series.reminders.length !== 0
        )
          throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "重复系列写入核验失败")
        const expectedOccurrences = occurrenceDates(
          draft.rule,
          draft.startDate,
          run.input.referenceDate,
          shiftCalendarDate(run.input.referenceDate, 42),
        )
        const actualOccurrences = context.database
          .prepare(
            "SELECT occurrence_date FROM task_occurrences WHERE series_id = ? AND item_id IS NOT NULL",
          )
          .all(series.id)
        if (actualOccurrences.length !== expectedOccurrences.length)
          throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "重复系列实例物化核验失败")
        results.push({ kind: "series", id: series.id, verified: true })
      }
    } else if (
      run.proposal.kind === "replan" &&
      run.input.type === "replan" &&
      run.baseSnapshot !== null
    ) {
      if (getSettings(context.database).aiPermission !== "open")
        throw new TaskPlanError("TASK_PLAN_CONTEXT_PERMISSION", "AI 日历权限已关闭，不能确认重排")
      const fresh = buildCalendarSnapshot(context.database, run.input)
      if (fresh.fingerprint !== run.baseSnapshot.fingerprint)
        throw new TaskPlanError("TASK_PLAN_STALE", "日历或任务已更新，请重新生成计划")
      const derived = deriveReplanProposal(
        fresh,
        run.proposal,
        run.input.lockedItemIds,
        run.input.originalText,
        instant,
      )
      assertConfirmable(derived.proposal)
      for (const change of run.proposal.changes) {
        if (change.action === "keep") continue
        if (change.action === "create") {
          const item = createItem(
            context.database,
            {
              requestId: change.draftId,
              title: change.title,
              estimatedMinutes: change.estimatedMinutes,
              scheduledStartAt: change.after.startAt,
              scheduledEndAt: change.after.endAt,
              scheduleTimezone: change.after.timezone,
              priority: "none",
              isFixed: false,
              categoryIds: [],
              projectIds: [],
            },
            run.input.startDate,
            instant,
          )
          if (
            item.title !== change.title ||
            item.estimatedMinutes !== change.estimatedMinutes ||
            item.scheduledStartAt !== new Date(change.after.startAt).toISOString() ||
            item.scheduledEndAt !== new Date(change.after.endAt).toISOString() ||
            item.scheduleTimezone !== change.after.timezone
          )
            throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "新任务安排写入核验失败")
          results.push({ kind: "item", id: item.id, verified: true })
          continue
        }
        const item = updateItem(
          context.database,
          change.itemId,
          {
            // The whole proposal passed version checks under this write lock; child writes can bump a later parent's version.
            expectedVersion: getItem(context.database, change.itemId, run.input.startDate).version,
            scheduledStartAt: change.after.startAt,
            scheduledEndAt: change.after.endAt,
            scheduleTimezone: change.after.timezone,
          },
          run.input.startDate,
          instant,
        )
        if (
          item.scheduledStartAt !== new Date(change.after.startAt).toISOString() ||
          item.scheduledEndAt !== new Date(change.after.endAt).toISOString() ||
          item.scheduleTimezone !== change.after.timezone
        )
          throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "任务安排写入核验失败")
        results.push({ kind: "schedule", id: item.id, verified: true })
      }
    } else if (run.proposal.kind === "plan" && run.input.type === "plan") {
      // 作为依据的笔记或待复用任务若已变化，整批中止而不是写入过期计划。
      assertFreshContext(context.database, run)
      const activeItems = context.database
        .prepare(
          "SELECT id, title FROM items WHERE status = 'active' AND deleted_at IS NULL AND is_tutorial = 0 ORDER BY created_at, id",
        )
        .all()
        .map((row) => taskRow.parse(row))
      for (const draft of run.proposal.tasks) {
        const localDate = planDate(run.input.startDate, draft.dayOffset)
        const existing =
          draft.existingItemId === null
            ? activeItems.find(
                (item) => normalizedTaskTitle(item.title) === normalizedTaskTitle(draft.title),
              )
            : activeItems.find((item) => item.id === draft.existingItemId)
        // 今日不再有主位数量上限：计划里的任务一律按主要任务入档。
        if (existing === undefined) {
          const item = createItem(
            context.database,
            {
              requestId: draft.draftId,
              title: draft.title,
              notes: `${draft.reason}\n计划记录：${run.id}`,
              priority: "none",
              isFixed: false,
              categoryIds: [],
              projectIds: [],
              today: { localDate, isFocus: false, isSecondary: false },
            },
            localDate,
            instant,
          )
          if (item.title !== draft.title || item.isSecondary)
            throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "计划任务写入核验失败")
          activeItems.push({ id: item.id, title: item.title })
          results.push({
            kind: "item",
            id: item.id,
            verified: true,
            localDate,
            disposition: "created",
          })
          continue
        }
        setTodayItem(context.database, {
          itemId: existing.id,
          localDate,
          isFocus: false,
          isSecondary: false,
        })
        const stored = z
          .object({ is_secondary: z.number() })
          .parse(
            context.database
              .prepare("SELECT is_secondary FROM today_items WHERE item_id = ? AND local_date = ?")
              .get(existing.id, localDate),
          )
        if (stored.is_secondary !== 0)
          throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "计划任务入档核验失败")
        results.push({
          kind: "item",
          id: existing.id,
          verified: true,
          localDate,
          disposition: "reused",
        })
      }
    } else throw new TaskPlanError("TASK_PLAN_TYPE_CONFLICT", "计划类型与请求不匹配")
    for (const result of results) {
      if (result.kind === "series") getTaskSeries(context.database, result.id)
      else
        getItem(
          context.database,
          result.id,
          run.input.type === "capture" ? run.input.referenceDate : run.input.startDate,
        )
    }
    if (run.input.type === "replan") {
      const finalSnapshot = buildCalendarSnapshot(context.database, run.input)
      const changedIds = new Set(
        results.filter((result) => result.kind !== "series").map((result) => result.id),
      )
      if (
        finalSnapshot.conflicts.some(
          (conflict) =>
            conflict.severity === "blocker" &&
            conflict.itemId !== undefined &&
            changedIds.has(conflict.itemId),
        )
      )
        throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "确认后的日历仍有阻断冲突")
    }
    const succeeded = saveTaskPlan(context.database, {
      ...run,
      status: "succeeded",
      results,
      updatedAt: instant.toISOString(),
      executionMs: Math.round(performance.now() - started),
    })
    const verified = readTaskPlan(context.database, run.id)
    if (verified.status !== "succeeded" || verified.results.length !== succeeded.results.length)
      throw new TaskPlanError("TASK_PLAN_VERIFY_FAILED", "计划确认核验失败")
    return verified
  })
}
