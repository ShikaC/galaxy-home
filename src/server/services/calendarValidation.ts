import { addDays } from "date-fns"
import {
  type CalendarConflict,
  type CalendarSnapshot,
  type CalendarValidationResult,
  calendarValidationResultSchema,
  type ScheduleChange,
} from "../../shared/calendar.js"
import { ERROR_CODES } from "../../shared/errorCodes.js"
import { buildCalendarSnapshotFromItems } from "./calendar.js"
import { scheduleConflicts } from "./calendarConflicts.js"
import { intervalFor, isoDate, localDateAt, rangeInstants } from "./calendarIntervals.js"
import { localDateTimeToInstant } from "./time.js"

export function validateScheduleChanges(
  snapshot: CalendarSnapshot,
  changes: readonly ScheduleChange[],
  options: { readonly manual?: boolean } = {},
): CalendarValidationResult {
  const changeIds = new Set(changes.map((change) => change.itemId))
  const blockers: CalendarConflict[] = []
  const warnings: CalendarConflict[] = []
  for (const change of changes) {
    const start = Date.parse(change.scheduledStartAt)
    const end = Date.parse(change.scheduledEndAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      blockers.push({
        code: ERROR_CODES.INVALID_INTERVAL,
        severity: "blocker",
        itemId: change.itemId,
        message: "安排结束时间必须晚于开始时间",
      })
  }
  if (blockers.length > 0)
    return calendarValidationResultSchema.parse({
      valid: false,
      blockers,
      warnings,
      freeSlots: snapshot.freeSlots,
      fingerprint: snapshot.fingerprint,
    })
  const updated = snapshot.items.map((item) => {
    const change = changes.find((value) => value.itemId === item.id)
    if (change === undefined) return item
    if (item.version !== change.expectedVersion)
      blockers.push({
        code: ERROR_CODES.VERSION_CONFLICT,
        severity: "blocker",
        itemId: item.id,
        message: "任务已在其他位置更新",
      })
    if (item.isFixed && !options.manual)
      blockers.push({
        code: ERROR_CODES.FIXED_ITEM,
        severity: "blocker",
        itemId: item.id,
        message: "固定日程不能移动",
      })
    if (item.status === "completed")
      blockers.push({
        code: ERROR_CODES.COMPLETED_ITEM,
        severity: "blocker",
        itemId: item.id,
        message: "已完成任务不能移动",
      })
    // 不再要求 estimatedMinutes：变更本身就带着明确的起止时间，
    // 块的长度就是时长。缺估时只影响重排估算，不应阻断手动拖动。
    return {
      ...item,
      scheduledStartAt: change.scheduledStartAt,
      scheduledEndAt: change.scheduledEndAt,
      scheduleTimezone: change.scheduleTimezone,
    }
  })
  for (const change of changes)
    if (!snapshot.items.some((item) => item.id === change.itemId))
      blockers.push({
        code: ERROR_CODES.ITEM_NOT_FOUND,
        severity: "blocker",
        itemId: change.itemId,
        message: "任务不在当前日历快照中",
      })
  const query = {
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    timezone: snapshot.timezone,
    workWindow: snapshot.workWindow,
  }
  const allowedRange = rangeInstants(query)
  for (const change of changes) {
    const start = Date.parse(change.scheduledStartAt)
    const end = Date.parse(change.scheduledEndAt)
    if (start < allowedRange.start || end > allowedRange.end)
      blockers.push({
        code: ERROR_CODES.OUTSIDE_RANGE,
        severity: "blocker",
        itemId: change.itemId,
        message: "候选安排必须完整落在日历范围内",
      })
  }
  const conflicts = scheduleConflicts(updated, query)
  for (const conflict of conflicts) {
    const relevant =
      conflict.itemId !== undefined &&
      (changeIds.has(conflict.itemId) ||
        (conflict.relatedItemId !== undefined && changeIds.has(conflict.relatedItemId)))
    if (!relevant) continue
    if (conflict.code === ERROR_CODES.OUTSIDE_WORK_WINDOW && !options.manual)
      blockers.push({ ...conflict, severity: "blocker" })
    else if (conflict.severity === "blocker") blockers.push(conflict)
    else warnings.push(conflict)
  }
  for (const item of updated.filter((value) => changeIds.has(value.id))) {
    const interval = intervalFor(item)
    if (interval === null) continue
    const deadline =
      item.dueAt === null
        ? item.dueDate === null
          ? null
          : localDateTimeToInstant(
              isoDate(addDays(new Date(`${item.dueDate}T12:00:00.000Z`), 1)),
              "00:00",
              snapshot.timezone,
            ).getTime()
        : Date.parse(item.dueAt)
    if (deadline !== null && interval.end > deadline)
      blockers.push({
        code: ERROR_CODES.DEADLINE_EXCEEDED,
        severity: "blocker",
        itemId: item.id,
        localDate: localDateAt(interval.end, snapshot.timezone),
        message: "安排结束时间晚于截止要求",
      })
    const duration = interval.end - interval.start
    // 用户拖出的块长度就是实际安排，比预计值短时只提醒、不阻断；
    // 否则想把一个大任务先安排一段就做不到，也违背「别让人填数字」的初衷。
    if (item.estimatedMinutes !== null && duration < item.estimatedMinutes * 60_000)
      warnings.push({
        code: ERROR_CODES.INSUFFICIENT_CAPACITY,
        severity: "warning",
        itemId: item.id,
        message: `安排时段少于预计 ${item.estimatedMinutes} 分钟，按实际长度安排`,
      })
    const available = snapshot.freeSlots.some(
      (slot) =>
        Date.parse(slot.startAt) <= interval.start && Date.parse(slot.endAt) >= interval.end,
    )
    if (
      !available &&
      blockers.some(
        (value) =>
          (value.itemId === item.id || value.relatedItemId === item.id) &&
          value.code === ERROR_CODES.OVERLAP,
      )
    )
      blockers.push({
        code: ERROR_CODES.INSUFFICIENT_CAPACITY,
        severity: "blocker",
        itemId: item.id,
        message: `没有可容纳 ${Math.round(duration / 60_000)} 分钟任务的空闲时段`,
      })
  }
  const next = buildCalendarSnapshotFromItems(updated, query)
  return calendarValidationResultSchema.parse({
    valid: blockers.length === 0,
    blockers,
    warnings,
    freeSlots: next.freeSlots,
    fingerprint: snapshot.fingerprint,
  })
}
