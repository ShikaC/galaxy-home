import { addDays } from "date-fns"
import {
  type CalendarConflict,
  type CalendarItem,
  type CalendarQuery,
  defaultWorkWindow,
} from "../../shared/calendar.js"
import {
  datesBetween,
  dayWindows,
  intervalFor,
  isoDate,
  localDateAt,
  overlaps,
  rangeInstants,
} from "./calendarIntervals.js"
import { localDateTimeToInstant } from "./time.js"

export function scheduleConflicts(
  items: readonly CalendarItem[],
  query: CalendarQuery,
): readonly CalendarConflict[] {
  const conflicts: CalendarConflict[] = []
  const rules = query.workWindow ?? defaultWorkWindow
  const range = rangeInstants(query)
  const scheduled = items.filter((item) => {
    const interval = intervalFor(item)
    return interval !== null && overlaps(interval, range)
  })
  for (const item of items) {
    if (item.status === "active" && intervalFor(item) === null && item.estimatedMinutes === null)
      conflicts.push({
        code: "UNKNOWN_DURATION",
        severity: "blocker",
        itemId: item.id,
        message: "未安排任务缺少预计耗时",
      })
  }
  for (const item of scheduled) {
    const interval = intervalFor(item)
    if (interval === null) continue
    for (const date of datesBetween(query.startDate, query.endDate)) {
      const day = {
        start: localDateTimeToInstant(date, "00:00", query.timezone).getTime(),
        end: localDateTimeToInstant(
          isoDate(addDays(new Date(`${date}T12:00:00.000Z`), 1)),
          "00:00",
          query.timezone,
        ).getTime(),
      }
      if (!overlaps(interval, day)) continue
      const windows = dayWindows(date, query.timezone, rules)
      if (!windows.some((window) => interval.start >= window.start && interval.end <= window.end))
        conflicts.push({
          code: "OUTSIDE_WORK_WINDOW",
          severity: "warning",
          itemId: item.id,
          localDate: date,
          message: "安排超出该日工作时段",
        })
    }
    if (!overlaps(interval, range))
      conflicts.push({
        code: "OUTSIDE_RANGE",
        severity: "blocker",
        itemId: item.id,
        message: "安排超出日历范围",
      })
    const deadline =
      item.dueAt === null
        ? item.dueDate === null
          ? null
          : localDateTimeToInstant(
              isoDate(addDays(new Date(`${item.dueDate}T12:00:00.000Z`), 1)),
              "00:00",
              query.timezone,
            ).getTime()
        : Date.parse(item.dueAt)
    if (deadline !== null && interval.end > deadline)
      conflicts.push({
        code: "DEADLINE_EXCEEDED",
        severity: "blocker",
        itemId: item.id,
        localDate: localDateAt(interval.end, query.timezone),
        message: "安排结束时间晚于截止要求",
      })
  }
  for (let index = 0; index < scheduled.length; index += 1) {
    const left = scheduled[index]
    if (left === undefined) continue
    const leftInterval = intervalFor(left)
    if (leftInterval === null) continue
    for (let otherIndex = index + 1; otherIndex < scheduled.length; otherIndex += 1) {
      const right = scheduled[otherIndex]
      if (right === undefined) continue
      const rightInterval = intervalFor(right)
      if (rightInterval !== null && overlaps(leftInterval, rightInterval))
        conflicts.push({
          code: "OVERLAP",
          severity: "blocker",
          itemId: left.id,
          relatedItemId: right.id,
          localDate: localDateAt(Math.max(leftInterval.start, rightInterval.start), query.timezone),
          message: `“${left.title}”与“${right.title}”时段冲突`,
        })
    }
  }
  return conflicts
}
