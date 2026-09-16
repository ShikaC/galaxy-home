import { Clock3, LockKeyhole } from "lucide-react"
import { type CSSProperties, type DragEvent, useEffect, useRef, useState } from "react"
import type { CalendarConflict, CalendarItem } from "../../../shared/calendar.js"

// 拖块边缘改变时长时的吸附粒度，与时间轴刻度一致。
const SNAP_MINUTES = 15
// 一个块最少保留这么长，避免拖成零高度后无法再抓取。
const MIN_EVENT_MINUTES = 15

function endLocalOf(date: string, endMinute: number): string {
  if (endMinute >= 24 * 60) {
    const next = new Date(`${date}T12:00:00.000Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    return `${next.toISOString().slice(0, 10)}T00:00`
  }
  const hours = String(Math.floor(endMinute / 60)).padStart(2, "0")
  const minutes = String(endMinute % 60).padStart(2, "0")
  return `${date}T${hours}:${minutes}`
}

function localParts(
  iso: string,
  timezone: string,
): { readonly date: string; readonly minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00"
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  }
}

function timeLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))
}

export function CalendarTimeline({
  conflicts,
  dates,
  items,
  onDropItem,
  onEditItem,
  onResizeItem,
  timezone,
}: {
  readonly conflicts: readonly CalendarConflict[]
  readonly dates: readonly string[]
  readonly items: readonly CalendarItem[]
  readonly onDropItem: (itemId: string, localDate: string, hour: number) => void
  readonly onEditItem: (item: CalendarItem) => void
  readonly onResizeItem: (item: CalendarItem, endLocal: string) => void
  readonly timezone: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // 拖动只在手势期间存在，不入库；松手才提交一次。
  const [resizePreview, setResizePreview] = useState<{
    readonly key: string
    readonly endMinute: number
  } | null>(null)
  const resizeDrag = useRef<{
    readonly item: CalendarItem
    readonly date: string
    readonly startMinute: number
    readonly initialEndMinute: number
    readonly startY: number
    endMinute: number
  } | null>(null)
  const firstDate = dates[0]
  useEffect(() => {
    if (firstDate !== undefined && scrollRef.current !== null) scrollRef.current.scrollTop = 8 * 60
  }, [firstDate])
  const hours = Array.from({ length: 24 }, (_, index) => index)
  const timelineStyle: CSSProperties & Record<`--${string}`, string | number> = {
    "--calendar-days": dates.length,
  }
  const onDrop = (event: DragEvent<HTMLButtonElement>, date: string, hour: number) => {
    event.preventDefault()
    const itemId = event.dataTransfer.getData("text/calendar-item")
    if (itemId !== "") onDropItem(itemId, date, hour)
  }
  return (
    <div className="calendar-timeline-scroll" ref={scrollRef}>
      <div className="calendar-timeline" style={timelineStyle}>
        <div className="calendar-timeline__corner" />
        {dates.map((date) => (
          <div className="calendar-timeline__day" key={date}>
            <strong>
              {new Intl.DateTimeFormat("zh-CN", {
                month: "numeric",
                day: "numeric",
                weekday: "short",
                timeZone: "UTC",
              }).format(new Date(`${date}T12:00:00.000Z`))}
            </strong>
          </div>
        ))}
        {hours.map((hour) => (
          <div className="calendar-timeline__hour-row" key={hour}>
            <span>{String(hour).padStart(2, "0")}:00</span>
            {dates.map((date) => (
              <button
                aria-label={`${date} ${hour}:00，拖放到这里安排`}
                tabIndex={-1}
                className="calendar-timeline__dropzone"
                key={date}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, date, hour)}
                type="button"
              />
            ))}
          </div>
        ))}
        {items.flatMap((item) => {
          if (item.scheduledStartAt === null || item.scheduledEndAt === null) return []
          const scheduledStartAt = item.scheduledStartAt
          const scheduledEndAt = item.scheduledEndAt
          const start = localParts(scheduledStartAt, timezone)
          const end = localParts(scheduledEndAt, timezone)
          return dates.flatMap((date, dayIndex) => {
            if (date < start.date || date > end.date) return []
            const startMinute = date === start.date ? start.minutes : 0
            const endMinute = date === end.date ? end.minutes : 24 * 60
            if (endMinute <= startMinute) return []
            const top = startMinute
            // 拖动中先用预览值渲染高度，松手才写库。
            const eventKey = `${item.id}-${date}`
            const previewing = resizePreview?.key === eventKey
            const effectiveEnd = previewing ? resizePreview.endMinute : endMinute
            const height = Math.max(28, Math.min(24 * 60 - top, effectiveEnd - startMinute))
            const resizable = !item.isFixed && item.status === "active"
            const hasConflict = conflicts.some(
              (conflict) => conflict.itemId === item.id || conflict.relatedItemId === item.id,
            )
            const eventStyle: CSSProperties & Record<`--${string}`, string | number> = {
              "--calendar-day": dayIndex,
              "--event-top": `${top}px`,
              "--event-height": `${height}px`,
            }
            return (
              <button
                aria-label={`编辑 ${item.title}，${timeLabel(scheduledStartAt, timezone)} 至 ${timeLabel(scheduledEndAt, timezone)}`}
                className={`calendar-event${item.isFixed ? " calendar-event--fixed" : ""}${item.status === "completed" ? " calendar-event--completed" : ""}${hasConflict ? " calendar-event--conflict" : ""}`}
                draggable={!item.isFixed && item.status === "active"}
                key={`${item.id}-${date}`}
                onClick={() => onEditItem(item)}
                onDragStart={(event) => event.dataTransfer.setData("text/calendar-item", item.id)}
                style={eventStyle}
                type="button"
              >
                <span className="calendar-event__title">
                  {item.isFixed ? <LockKeyhole size={11} /> : <Clock3 size={11} />}
                  {item.title}
                </span>
                <small>
                  {timeLabel(scheduledStartAt, timezone)}–
                  {timeLabel(
                    previewing
                      ? `${date}T${String(Math.floor(effectiveEnd / 60)).padStart(2, "0")}:${String(effectiveEnd % 60).padStart(2, "0")}`
                      : scheduledEndAt,
                    timezone,
                  )}
                </small>
                {resizable ? (
                  <span
                    aria-hidden
                    className="calendar-event__resize"
                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                    onPointerDown={(pointerEvent) => {
                      // 阻止冒泡，否则会触发块的点击编辑和 HTML 拖拽。
                      pointerEvent.preventDefault()
                      pointerEvent.stopPropagation()
                      pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId)
                      const initialEndMinute = Math.min(endMinute, 24 * 60)
                      resizeDrag.current = {
                        item,
                        date,
                        startMinute,
                        initialEndMinute,
                        startY: pointerEvent.clientY,
                        endMinute: initialEndMinute,
                      }
                      setResizePreview({ key: eventKey, endMinute: initialEndMinute })
                    }}
                    onPointerMove={(pointerEvent) => {
                      const drag = resizeDrag.current
                      if (drag === null) return
                      const delta =
                        Math.round((pointerEvent.clientY - drag.startY) / SNAP_MINUTES) *
                        SNAP_MINUTES
                      drag.endMinute = Math.min(
                        24 * 60,
                        Math.max(
                          drag.startMinute + MIN_EVENT_MINUTES,
                          drag.initialEndMinute + delta,
                        ),
                      )
                      setResizePreview({ key: eventKey, endMinute: drag.endMinute })
                    }}
                    onPointerUp={(pointerEvent) => {
                      const drag = resizeDrag.current
                      resizeDrag.current = null
                      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId)
                      setResizePreview(null)
                      if (drag === null || drag.endMinute === drag.initialEndMinute) return
                      onResizeItem(drag.item, endLocalOf(drag.date, drag.endMinute))
                    }}
                  />
                ) : null}
              </button>
            )
          })
        })}
      </div>
    </div>
  )
}
