import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../ui/Button.js"

export function CalendarControls({
  startDate,
  endDateLabel,
  view,
  move,
  goToday,
  setView,
  workStart,
  workEnd,
  setWorkStart,
  setWorkEnd,
}: {
  readonly startDate: string
  readonly endDateLabel: string
  readonly view: "day" | "week"
  readonly move: (amount: number) => void
  readonly goToday: () => void
  readonly setView: (view: "day" | "week") => void
  readonly workStart: string
  readonly workEnd: string
  readonly setWorkStart: (value: string) => void
  readonly setWorkEnd: (value: string) => void
}) {
  return (
    <section className="calendar-controls" aria-label="日历范围和工作时段">
      <div className="calendar-controls__range">
        <Button aria-label="上一段" onClick={() => move(-1)} variant="ghost">
          <ChevronLeft size={16} />
        </Button>
        <Button onClick={goToday} variant="secondary">
          今天
        </Button>
        <Button aria-label="下一段" onClick={() => move(1)} variant="ghost">
          <ChevronRight size={16} />
        </Button>
        <strong>
          {startDate}
          {view === "week" ? ` — ${endDateLabel}` : ""}
        </strong>
      </div>
      <fieldset className="calendar-controls__view" aria-label="日历视图">
        <button aria-pressed={view === "day"} onClick={() => setView("day")} type="button">
          日
        </button>
        <button aria-pressed={view === "week"} onClick={() => setView("week")} type="button">
          周
        </button>
      </fieldset>
      <div className="calendar-work-window">
        <span>容量规则：周一至周五</span>
        <label>
          从
          <input
            aria-label="工作开始时间"
            onChange={(event) => setWorkStart(event.target.value)}
            type="time"
            value={workStart}
          />
        </label>
        <label>
          至
          <input
            aria-label="工作结束时间"
            onChange={(event) => setWorkEnd(event.target.value)}
            type="time"
            value={workEnd}
          />
        </label>
      </div>
    </section>
  )
}
