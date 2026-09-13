import type { CalendarItem } from "../../../shared/calendar.js"
import { localDateTimeInputFor } from "../../lib/date.js"

export function CalendarDeadline({
  item,
  timezone,
}: {
  readonly item: Pick<CalendarItem, "dueDate" | "dueAt">
  readonly timezone: string
}) {
  const value = item.dueDate ?? item.dueAt
  if (value === null) return null
  const local = item.dueAt === null ? value : localDateTimeInputFor(item.dueAt, timezone)
  return (
    <time
      className="calendar-deadline"
      dateTime={value}
      title={item.dueAt === null ? "日期截止" : timezone}
    >
      <span>{local.slice(0, 10)}</span>{" "}
      <span>{item.dueAt === null ? "日期截止" : `${local.slice(11, 16)} 截止`}</span>
    </time>
  )
}
