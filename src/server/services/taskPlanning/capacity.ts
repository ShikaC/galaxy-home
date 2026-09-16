import { addDays } from "date-fns"
import type { CalendarSnapshot } from "../../../shared/calendar.js"
import { ERROR_CODES } from "../../../shared/errorCodes.js"
import { DEFAULT_TASK_MINUTES } from "../../../shared/taskCore.js"
import { type TaskPlanProposal, taskPlanConflictSchema } from "../../../shared/taskPlanning.js"
import { isoDate, localDateAt } from "../calendarIntervals.js"
import { localDateTimeToInstant } from "../time.js"

type ReplanCapacityContext = {
  readonly snapshot: CalendarSnapshot
  readonly proposal: Extract<TaskPlanProposal, { readonly kind: "replan" }>
  readonly originalText: string
  readonly now: Date
  readonly freeSlots: CalendarSnapshot["freeSlots"]
}

export function unresolvedCapacity(context: ReplanCapacityContext) {
  const { snapshot, proposal, originalText, now, freeSlots } = context
  const mentioned = new Set(
    proposal.changes.flatMap((change) => (change.action === "create" ? [] : [change.itemId])),
  )
  const moved = new Set(
    proposal.changes.flatMap((change) => (change.action === "move" ? [change.itemId] : [])),
  )
  const includesDate = (date: string) => date >= snapshot.startDate && date < snapshot.endDate
  const midnight = (date: string) =>
    localDateTimeToInstant(date, "00:00", snapshot.timezone).getTime()
  const rangeEnd = midnight(snapshot.endDate)
  const plansAllUnscheduled = /(?:所有|全部)(?:的)?(?:未安排|未排期|任务)/u.test(originalText)
  const work = snapshot.unscheduled.flatMap((item) => {
    if (item.status !== "active" || moved.has(item.id)) return []
    const anchored =
      item.dateAssignments.some(includesDate) ||
      (item.dueDate !== null && includesDate(item.dueDate)) ||
      (item.dueAt !== null &&
        includesDate(localDateAt(Date.parse(item.dueAt), snapshot.timezone))) ||
      (item.recurrenceDate != null && includesDate(item.recurrenceDate))
    if (
      !(
        anchored ||
        mentioned.has(item.id) ||
        originalText.includes(item.title) ||
        plansAllUnscheduled
      )
    )
      return []
    const deadline = Math.min(
      rangeEnd,
      item.dueAt !== null
        ? Date.parse(item.dueAt)
        : item.dueDate !== null
          ? midnight(isoDate(addDays(new Date(`${item.dueDate}T12:00:00.000Z`), 1)))
          : rangeEnd,
    )
    // 没有估时的任务不隐身：按默认时长参与计算，并标记这是估算值，
    // 好让冲突消息和提案能看到哪些数字不是用户设的。
    const minutes = item.estimatedMinutes ?? DEFAULT_TASK_MINUTES
    const estimated = item.estimatedMinutes === null
    return [
      {
        item,
        minutes,
        estimated,
        duration: minutes * 60_000,
        deadline,
        earliest: Math.max(
          now.getTime(),
          item.recurrenceDate == null ? now.getTime() : midnight(item.recurrenceDate),
        ),
      },
    ]
  })
  const available = freeSlots.map((slot) => ({
    start: Math.max(Date.parse(slot.startAt), now.getTime()),
    end: Date.parse(slot.endAt),
  }))
  const conflicts = work.map(({ item, minutes, estimated }) =>
    taskPlanConflictSchema.parse({
      code: ERROR_CODES.UNSCHEDULED_WORK,
      message: estimated
        ? `“${item.title}”没有预计耗时，重排按默认 ${minutes} 分钟估算，本次仍未安排`
        : `“${item.title}”仍未安排，请补充具体时段或调整本次重排范围`,
      itemId: item.id,
      blocking: true,
    }),
  )
  for (const { item, minutes, estimated, duration, deadline, earliest } of work) {
    if (
      !available.some(
        (slot) => Math.min(slot.end, deadline) - Math.max(slot.start, earliest) >= duration,
      )
    )
      conflicts.push(
        taskPlanConflictSchema.parse({
          code: ERROR_CODES.INSUFFICIENT_CAPACITY,
          message: `“${item.title}”在截止要求内没有可容纳 ${minutes} 分钟${estimated ? "（默认估算）" : ""}的空闲时段`,
          itemId: item.id,
          blocking: true,
        }),
      )
  }
  for (const deadline of new Set(work.map((item) => item.deadline))) {
    const dueWork = work.filter((item) => item.deadline <= deadline)
    const required = dueWork.reduce((sum, item) => sum + item.duration, 0)
    const capacity = available.reduce(
      (sum, slot) => sum + Math.max(0, Math.min(slot.end, deadline) - slot.start),
      0,
    )
    if (required > capacity)
      conflicts.push(
        taskPlanConflictSchema.parse({
          code: ERROR_CODES.INSUFFICIENT_CAPACITY,
          message: `截止要求内的未安排任务合计需要 ${required / 60_000} 分钟，剩余空闲时间只有 ${capacity / 60_000} 分钟：${dueWork.map(({ item }) => item.title).join("、")}`,
          itemId: null,
          blocking: true,
        }),
      )
  }
  return conflicts
}
