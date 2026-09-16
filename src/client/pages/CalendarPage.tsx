import { CalendarPlus, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router"
import type { CalendarItem, WorkWindowRule } from "../../shared/calendar.js"
import { DEFAULT_TASK_MINUTES } from "../../shared/taskCore.js"
import { useAppTime } from "../components/AppContext.js"
import { CalendarCapacity } from "../components/calendar/CalendarCapacity.js"
import { CalendarControls } from "../components/calendar/CalendarControls.js"
import { CalendarDeadline } from "../components/calendar/CalendarDeadline.js"
import {
  type CalendarFormValue,
  CalendarSchedulePanel,
} from "../components/calendar/CalendarSchedulePanel.js"
import { CalendarTimeline } from "../components/calendar/CalendarTimeline.js"
import { PageHeader } from "../components/PageHeader.js"
import { Button } from "../components/ui/Button.js"
import { useCalendarActions } from "../lib/calendar.js"
import {
  localDateTimeFromInstant,
  localInstant,
  shiftDate,
  weekStart,
} from "../lib/calendarDates.js"
import { useCalendar } from "../lib/queries.js"

type CalendarView = "day" | "week"

export function CalendarPage() {
  const { timezone, today } = useAppTime()
  const [view, setView] = useState<CalendarView>("week")
  const [anchor, setAnchor] = useState(today)
  const [workStart, setWorkStart] = useState("09:00")
  const [workEnd, setWorkEnd] = useState("18:00")
  const [selected, setSelected] = useState<CalendarItem | null>(null)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [meetingRequestId, setMeetingRequestId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const startDate = view === "week" ? weekStart(anchor) : anchor
  const endDate = shiftDate(startDate, view === "week" ? 7 : 1)
  const dates = useMemo(
    () =>
      Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => shiftDate(startDate, index)),
    [startDate, view],
  )
  const workWindow = useMemo<readonly WorkWindowRule[]>(
    () => [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: workStart, endTime: workEnd })),
    [workEnd, workStart],
  )
  const range = { startDate, endDate, timezone, workWindow }
  const calendar = useCalendar(startDate, endDate, timezone, workWindow)
  const actions = useCalendarActions(range)
  const move = (amount: number) =>
    setAnchor((current) => shiftDate(current, amount * (view === "week" ? 7 : 1)))
  const schedule = (item: CalendarItem, start: string, end: string) => {
    setError(null)
    try {
      actions.scheduleItem.mutate(
        {
          itemId: item.id,
          expectedVersion: item.version,
          scheduledStartAt: localInstant(start, timezone),
          scheduledEndAt: localInstant(end, timezone),
          scheduleTimezone: timezone,
        },
        {
          onSuccess: () => setSelected(null),
          onError: (cause) => setError(cause instanceof Error ? cause.message : "安排失败，请重试"),
        },
      )
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause
      setError(cause.message)
    }
  }
  const submit = (value: CalendarFormValue) => {
    try {
      if (meetingOpen) {
        setError(null)
        actions.createFixedMeeting.mutate(
          {
            title: value.title,
            requestId: meetingRequestId ?? crypto.randomUUID(),
            scheduledStartAt: localInstant(value.start, timezone),
            scheduledEndAt: localInstant(value.end, timezone),
          },
          {
            onSuccess: () => {
              setMeetingOpen(false)
              setMeetingRequestId(null)
            },
            onError: () => setError("固定日程创建失败，请检查时间后重试"),
          },
        )
        return
      }
      if (selected !== null) schedule(selected, value.start, value.end)
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause
      setError(cause.message)
    }
  }
  // 拖块边缘改时长：块的长度就是安排时长，不需要用户输数字。
  const resizeItem = (item: CalendarItem, endLocal: string) => {
    if (item.scheduledStartAt === null) return
    schedule(item, localDateTimeFromInstant(item.scheduledStartAt, timezone), endLocal)
  }
  const dropItem = (itemId: string, localDate: string, hour: number) => {
    const item = calendar.data?.items.find((value) => value.id === itemId)
    if (item === undefined) return
    const duration = item.estimatedMinutes ?? DEFAULT_TASK_MINUTES
    const start = `${localDate}T${String(hour).padStart(2, "0")}:00`
    const startInstant = localInstant(start, timezone)
    const endInstant = new Date(Date.parse(startInstant) + duration * 60_000).toISOString()
    schedule(item, start, localDateTimeFromInstant(endInstant, timezone))
  }
  return (
    <div className="workspace-page calendar-page">
      <PageHeader
        actions={
          <>
            <Link
              className="button button--secondary"
              to={`/task-plans?mode=replan&startDate=${startDate}&endDate=${endDate}&workStart=${workStart}&workEnd=${workEnd}`}
            >
              <Sparkles size={15} />
              智能重排
            </Link>
            <Button
              onClick={() => {
                setError(null)
                setSelected(null)
                setMeetingRequestId(crypto.randomUUID())
                setMeetingOpen(true)
              }}
              variant="secondary"
            >
              <CalendarPlus size={15} />
              固定日程
            </Button>
          </>
        }
        eyebrow="时间与容量"
        subtitle="全天安排、截止要求和实际时段分别呈现。临时会议会保留并显示冲突。"
        title="日历"
      />
      <CalendarControls
        startDate={startDate}
        endDateLabel={shiftDate(endDate, -1)}
        view={view}
        move={move}
        goToday={() => setAnchor(today)}
        setView={setView}
        workStart={workStart}
        workEnd={workEnd}
        setWorkStart={setWorkStart}
        setWorkEnd={setWorkEnd}
      />
      {calendar.isLoading ? (
        <p aria-live="polite" className="calendar-state">
          正在读取真实安排…
        </p>
      ) : null}
      {calendar.isError ? (
        <p className="calendar-state calendar-state--error" role="alert">
          日历加载失败。
          <button onClick={() => void calendar.refetch()} type="button">
            重试
          </button>
        </p>
      ) : null}
      {calendar.data === undefined ? null : (
        <div className="calendar-layout">
          <aside className="calendar-backlog">
            <h2>
              未安排任务 <span>{calendar.data.unscheduled.length}</span>
            </h2>
            <p>拖到时间轴，或按“安排”输入准确时间。</p>
            <div>
              {calendar.data.unscheduled.map((item) => (
                <article
                  draggable
                  key={item.id}
                  onDragStart={(event) => event.dataTransfer.setData("text/calendar-item", item.id)}
                >
                  <strong>{item.title}</strong>
                  <small>
                    {item.estimatedMinutes === null
                      ? `耗时未填，按 ${DEFAULT_TASK_MINUTES} 分钟算`
                      : `${item.estimatedMinutes} 分钟`}
                    {item.dueDate === null && item.dueAt === null ? null : (
                      <>
                        {" "}
                        · <CalendarDeadline item={item} timezone={timezone} />
                      </>
                    )}
                  </small>
                  <button
                    onClick={() => {
                      setError(null)
                      setSelected(item)
                    }}
                    type="button"
                  >
                    安排
                  </button>
                </article>
              ))}
            </div>
          </aside>
          <section className="calendar-board">
            <CalendarCapacity snapshot={calendar.data} />
            <div className="calendar-lanes">
              <div>
                <span>全天安排</span>
                {calendar.data.allDay.map((item) => (
                  <button key={item.id} onClick={() => setSelected(item)} type="button">
                    {item.title} ·{" "}
                    {item.dateAssignments
                      .filter((date) => date >= startDate && date < endDate)
                      .join("、")}
                  </button>
                ))}
              </div>
              <div>
                <span>截止要求</span>
                {calendar.data.deadlines.map((item) => (
                  <button key={item.id} onClick={() => setSelected(item)} type="button">
                    {item.title} · <CalendarDeadline item={item} timezone={timezone} />
                  </button>
                ))}
              </div>
            </div>
            <CalendarTimeline
              conflicts={calendar.data.conflicts}
              dates={dates}
              items={calendar.data.scheduled}
              onDropItem={dropItem}
              onEditItem={(item) => {
                setError(null)
                setSelected(item)
              }}
              onResizeItem={resizeItem}
              timezone={timezone}
            />
          </section>
        </div>
      )}
      {error !== null && selected === null && !meetingOpen ? (
        <p role="alert" className="calendar-editor__error">
          {error}
        </p>
      ) : null}
      {selected === null && !meetingOpen ? null : (
        <CalendarSchedulePanel
          error={error}
          item={selected}
          mode={meetingOpen ? "meeting" : "schedule"}
          onCancel={() => {
            setSelected(null)
            setMeetingOpen(false)
            setError(null)
          }}
          onSubmit={submit}
          pending={actions.scheduleItem.isPending || actions.createFixedMeeting.isPending}
          timezone={timezone}
        />
      )}
    </div>
  )
}
