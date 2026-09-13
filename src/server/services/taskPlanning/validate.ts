import { TZDate } from "@date-fns/tz"
import {
  type CalendarConflict,
  type CalendarSnapshot,
  calendarItemSchema,
  type ScheduleChange,
  scheduleChangeSchema,
} from "../../../shared/calendar.js"
import { type TaskPlanProposal, taskPlanConflictSchema } from "../../../shared/taskPlanning.js"
import { buildCalendarSnapshotFromItems, validateScheduleChanges } from "../calendar.js"
import { scheduleConflicts } from "../calendarConflicts.js"
import { unresolvedCapacity } from "./capacity.js"
import { TaskPlanError } from "./store.js"

function sameSlot(
  left: { readonly startAt: string; readonly endAt: string; readonly timezone: string } | null,
  item: CalendarSnapshot["items"][number],
): boolean {
  if (left === null) return item.scheduledStartAt === null && item.scheduledEndAt === null
  return (
    left.startAt === item.scheduledStartAt &&
    left.endAt === item.scheduledEndAt &&
    left.timezone === item.scheduleTimezone
  )
}

type ReplanProposal = Extract<TaskPlanProposal, { readonly kind: "replan" }>
const derivedConflictCodes = new Set([
  "INVALID_INTERVAL",
  "OUTSIDE_RANGE",
  "OUTSIDE_WORK_WINDOW",
  "OVERLAP",
  "DEADLINE_EXCEEDED",
  "UNKNOWN_DURATION",
  "ITEM_NOT_FOUND",
  "VERSION_CONFLICT",
  "FIXED_ITEM",
  "COMPLETED_ITEM",
  "INSUFFICIENT_CAPACITY",
  "USER_LOCKED",
  "PAST_SCHEDULE",
  "DURATION_TOO_SHORT",
  "RECURRENCE_DATE",
  "UNSCHEDULED_WORK",
])

function exposedConflict(conflict: CalendarConflict) {
  return taskPlanConflictSchema.parse({
    code: conflict.code,
    message: conflict.message,
    itemId: conflict.itemId ?? null,
    blocking: conflict.severity === "blocker",
  })
}

function localDateAt(instant: string, timezone: string): string {
  const date = new TZDate(instant, timezone)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function deriveReplanProposal(
  snapshot: CalendarSnapshot,
  proposal: ReplanProposal,
  lockedItemIds: readonly string[],
  originalText: string,
  now: Date,
): { readonly proposal: ReplanProposal; readonly changes: readonly ScheduleChange[] } {
  const identities = new Set<string>()
  const items = [...snapshot.items]
  const changes: ScheduleChange[] = []
  const serverConflicts = []
  for (const change of proposal.changes) {
    const identity = change.action === "create" ? change.draftId : change.itemId
    if (identities.has(identity)) throw new TaskPlanError("INVALID_TASK_PLAN", "计划包含重复任务")
    identities.add(identity)
    if (change.action === "create") {
      items.push(
        calendarItemSchema.parse({
          id: change.draftId,
          title: change.title,
          status: "active",
          version: 1,
          dueAt: null,
          dueDate: null,
          estimatedMinutes: change.estimatedMinutes,
          scheduledStartAt: null,
          scheduledEndAt: null,
          scheduleTimezone: null,
          isFixed: false,
          dateAssignments: [],
        }),
      )
      changes.push(
        scheduleChangeSchema.parse({
          itemId: change.draftId,
          expectedVersion: 1,
          scheduledStartAt: change.after.startAt,
          scheduledEndAt: change.after.endAt,
          scheduleTimezone: change.after.timezone,
        }),
      )
      continue
    }
    const item = snapshot.items.find((candidate) => candidate.id === change.itemId)
    if (item === undefined) throw new TaskPlanError("INVALID_TASK_PLAN", "计划引用了未知任务")
    if (!sameSlot(change.before, item))
      throw new TaskPlanError("INVALID_TASK_PLAN", "计划原安排与快照不一致")
    if (change.action === "keep") {
      if (!sameSlot(change.after, item))
        throw new TaskPlanError("INVALID_TASK_PLAN", "保留任务不能暗含移动")
      continue
    }
    if (lockedItemIds.includes(change.itemId))
      serverConflicts.push(
        taskPlanConflictSchema.parse({
          code: "USER_LOCKED",
          message: "用户锁定的任务不能移动",
          itemId: change.itemId,
          blocking: true,
        }),
      )
    changes.push(
      scheduleChangeSchema.parse({
        itemId: item.id,
        expectedVersion: change.expectedVersion,
        scheduledStartAt: change.after.startAt,
        scheduledEndAt: change.after.endAt,
        scheduleTimezone: change.after.timezone,
      }),
    )
  }
  const augmented = buildCalendarSnapshotFromItems(items, {
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    timezone: snapshot.timezone,
    workWindow: [...snapshot.workWindow],
  })
  const validation = validateScheduleChanges(augmented, changes)
  const finalConflicts = scheduleConflicts(
    augmented.items.map((item) => {
      const change = changes.find((candidate) => candidate.itemId === item.id)
      return change === undefined
        ? item
        : {
            ...item,
            scheduledStartAt: change.scheduledStartAt,
            scheduledEndAt: change.scheduledEndAt,
            scheduleTimezone: change.scheduleTimezone,
          }
    }),
    snapshot,
  )
  serverConflicts.push(
    ...unresolvedCapacity({
      snapshot,
      proposal,
      originalText,
      now,
      freeSlots: validation.freeSlots,
    }),
  )
  for (const change of proposal.changes) {
    if (change.action === "keep") continue
    const itemId = change.action === "move" ? change.itemId : change.draftId
    if (Date.parse(change.after.startAt) < now.getTime())
      serverConflicts.push(
        taskPlanConflictSchema.parse({
          code: "PAST_SCHEDULE",
          message: "不能把任务安排到已过去的时段",
          itemId,
          blocking: true,
        }),
      )
    const item = augmented.items.find((candidate) => candidate.id === itemId)
    if (
      change.action === "move" &&
      item?.recurrenceDate != null &&
      localDateAt(change.after.startAt, change.after.timezone) < item.recurrenceDate
    )
      serverConflicts.push(
        taskPlanConflictSchema.parse({
          code: "RECURRENCE_DATE",
          message: "重复任务不能安排到名义发生日期之前",
          itemId,
          blocking: true,
        }),
      )
    if (
      item !== undefined &&
      item.estimatedMinutes !== null &&
      Date.parse(change.after.endAt) - Date.parse(change.after.startAt) <
        item.estimatedMinutes * 60_000
    )
      serverConflicts.push(
        taskPlanConflictSchema.parse({
          code: "DURATION_TOO_SHORT",
          message: "安排时长短于任务预计耗时",
          itemId,
          blocking: true,
        }),
      )
  }
  const unresolvedConflicts = [
    ...proposal.unresolvedConflicts.filter((conflict) => !derivedConflictCodes.has(conflict.code)),
    ...serverConflicts,
    ...finalConflicts.map(exposedConflict),
    ...validation.blockers.map(exposedConflict),
    ...validation.warnings.map(exposedConflict),
  ].filter(
    (conflict, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.code === conflict.code &&
          candidate.itemId === conflict.itemId &&
          candidate.message === conflict.message,
      ) === index,
  )
  return {
    proposal: {
      ...proposal,
      unresolvedConflicts,
    },
    changes,
  }
}

export function assertConfirmable(proposal: ReplanProposal): void {
  const blockers = proposal.unresolvedConflicts.filter((conflict) => conflict.blocking)
  if (blockers.length > 0)
    throw new TaskPlanError(
      "TASK_PLAN_BLOCKED",
      blockers.map((conflict) => conflict.message).join("；"),
    )
}
