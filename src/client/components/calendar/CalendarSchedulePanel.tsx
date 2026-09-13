import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import type { CalendarItem } from "../../../shared/calendar.js"
import { Button } from "../ui/Button.js"
import { DialogSurface } from "../ui/ModalSurface.js"

function localInput(iso: string | null, timezone: string): string {
  if (iso === null) return ""
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
    parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`
}

export type CalendarFormValue = {
  readonly title: string
  readonly start: string
  readonly end: string
}

export function CalendarSchedulePanel({
  error,
  item,
  mode,
  onCancel,
  onSubmit,
  pending,
  timezone,
}: {
  readonly error: string | null
  readonly item: CalendarItem | null
  readonly mode: "schedule" | "meeting"
  readonly onCancel: () => void
  readonly onSubmit: (value: CalendarFormValue) => void
  readonly pending: boolean
  readonly timezone: string
}) {
  const [title, setTitle] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  useEffect(() => {
    setTitle(item?.title ?? "")
    setStart(localInput(item?.scheduledStartAt ?? null, timezone))
    setEnd(localInput(item?.scheduledEndAt ?? null, timezone))
  }, [item, timezone])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ title, start, end })
  }
  return (
    <DialogSurface
      onClose={onCancel}
      ariaLabel={mode === "meeting" ? "创建固定日程" : "安排任务"}
      className="calendar-editor"
    >
      <div>
        <p className="eyebrow">{mode === "meeting" ? "固定日程" : "明确安排"}</p>
        <h2>{mode === "meeting" ? "加入会议" : item?.title}</h2>
      </div>
      <form
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault()
        }}
      >
        {mode === "meeting" ? (
          <label>
            标题
            <input
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
        ) : null}
        <label>
          开始
          <input
            onChange={(event) => setStart(event.target.value)}
            required
            type="datetime-local"
            value={start}
          />
        </label>
        <label>
          结束
          <input
            onChange={(event) => setEnd(event.target.value)}
            required
            type="datetime-local"
            value={end}
          />
        </label>
        {item?.estimatedMinutes === null ? (
          <p className="calendar-editor__hint">
            这个任务还没有预计耗时。请先在任务详情补充，避免把未知时长当成零。
          </p>
        ) : null}
        {error === null ? null : (
          <p aria-live="assertive" className="calendar-editor__error" role="alert">
            {error}
          </p>
        )}
        <div className="calendar-editor__actions">
          <Button onClick={onCancel} type="button" variant="secondary">
            取消
          </Button>
          <Button loading={pending} type="submit">
            {mode === "meeting" ? "创建固定日程" : "保存安排"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  )
}
