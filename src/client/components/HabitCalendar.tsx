import { useQuery } from "@tanstack/react-query"
import type { Habit } from "../../shared/habits.js"
import { apiRequest } from "../lib/api.js"
import { habitsSchema } from "../lib/schemas.js"
import { SectionHeader } from "./PageHeader.js"
import { Badge } from "./ui/Status.js"

export type HabitCalendarDay = {
  readonly count: number
  readonly date: string
  readonly inMonth: boolean
}

function recordLabel(habit: Habit) {
  if (habit.todayStatus === "leave") return "请假"
  if (habit.isRestDay) return "固定休息日"
  if (habit.completedToday) return `已完成 ${habit.currentCount}/${habit.targetCount}`
  if (habit.currentCount > 0) return `已记录 ${habit.currentCount}/${habit.targetCount}`
  return "未完成"
}

export function HabitCalendar({
  days,
  onSelect,
  selectedDate,
  today,
}: {
  readonly days: readonly HabitCalendarDay[]
  readonly onSelect: (date: string) => void
  readonly selectedDate: string
  readonly today: string
}) {
  const records = useQuery({
    queryKey: ["habit-day", selectedDate],
    queryFn: () => apiRequest(`/api/habits?localDate=${selectedDate}`, habitsSchema),
  })
  const realRecords = records.data?.filter((habit) => !habit.isTutorial) ?? []
  return (
    <section className="calendar-frame">
      <SectionHeader title={`${today.slice(0, 7).replace("-", " 年 ")} 月`} />
      <div className="calendar-weekdays">
        {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {days.map((day) => (
          <button
            aria-label={`${day.date} 完成 ${day.count} 个习惯`}
            aria-pressed={selectedDate === day.date}
            className={`${day.inMonth ? "" : "outside"}${day.count > 0 ? " checked" : ""}`}
            disabled={day.date > today}
            key={day.date}
            onClick={() => onSelect(day.date)}
            type="button"
          >
            <span>{Number(day.date.slice(-2))}</span>
            {day.count > 0 ? <small>{day.count}</small> : null}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="habit-day-detail">
        <strong>{selectedDate} 记录</strong>
        {realRecords.length === 0 ? (
          <p>当天没有可查看的习惯记录。</p>
        ) : (
          <ul>
            {realRecords.map((habit) => (
              <li key={habit.id}>
                <span className="habit-day-detail__name">{habit.name}</span>
                <span className="habit-day-detail__status">
                  {habit.correctedToday ? <Badge tone="attention">已修正</Badge> : null}
                  <small>{recordLabel(habit)}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
