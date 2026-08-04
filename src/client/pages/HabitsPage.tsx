import { useQuery } from "@tanstack/react-query"
import { addDays, format, startOfMonth, subDays } from "date-fns"
import { Plus, Target } from "lucide-react"
import { useState } from "react"
import { HabitCorrection } from "../components/HabitCorrection.js"
import { HabitDialog } from "../components/HabitDialog.js"
import { HabitRow } from "../components/HabitRow.js"
import { HabitTrend } from "../components/HabitTrend.js"
import { PageHeader, SectionHeader } from "../components/PageHeader.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { apiRequest, localDate } from "../lib/api.js"
import { useHabitMutation } from "../lib/mutations.js"
import { useHabits } from "../lib/queries.js"
import { habitSummariesSchema } from "../lib/schemas.js"

export function HabitsPage() {
  const habits = useHabits()
  const record = useHabitMutation("record")
  const undo = useHabitMutation("undo")
  const [dialogOpen, setDialogOpen] = useState(false)
  const end = localDate()
  const start = format(subDays(new Date(`${end}T12:00:00`), 29), "yyyy-MM-dd")
  const summaries = useQuery({
    queryKey: ["habit-summaries", start, end],
    queryFn: () =>
      apiRequest(`/api/habits/summaries?start=${start}&end=${end}`, habitSummariesSchema),
  })
  const summaryMap = new Map(
    summaries.data?.map((entry) => [entry.localDate, entry.completedHabits]),
  )
  const chartData = Array.from({ length: 30 }, (_value, index) => {
    const date = format(addDays(new Date(`${start}T12:00:00`), index), "yyyy-MM-dd")
    return { date: date.slice(5), 完成习惯: summaryMap.get(date) ?? 0 }
  })
  const monthStart = startOfMonth(new Date(`${end}T12:00:00`))
  const firstOffset = monthStart.getDay()
  const calendar = Array.from({ length: 42 }, (_value, index) => {
    const date = format(addDays(monthStart, index - firstOffset), "yyyy-MM-dd")
    return { date, inMonth: date.slice(0, 7) === end.slice(0, 7), count: summaryMap.get(date) ?? 0 }
  })
  return (
    <div className="page">
      <PageHeader
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus size={16} />
            新习惯
          </Button>
        }
        subtitle="休息和请假不打断连续；所有统计都以修正后的记录为准。"
        title="习惯"
      />
      <section className="section-band">
        <SectionHeader title="今天" />
        {habits.data?.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => setDialogOpen(true)} size="compact">
                创建习惯
              </Button>
            }
            description="从一个愿意重复的小动作开始。"
            icon={Target}
            title="还没有习惯"
          />
        ) : (
          <div className="habit-grid">
            {habits.data?.map((habit) => (
              <HabitRow
                habit={habit}
                key={habit.id}
                onRecord={() => record.mutate(habit.id)}
                onUndo={() => undo.mutate(habit.id)}
              />
            ))}
          </div>
        )}
      </section>
      <div className="analytics-grid">
        <HabitTrend data={chartData.slice(-7)} title="本周趋势" />
        <HabitTrend data={chartData} title="近 30 天趋势" />
        <section className="calendar-frame">
          <SectionHeader title={`${end.slice(0, 7).replace("-", " 年 ")} 月`} />
          <div className="calendar-weekdays">
            {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendar.map((day) => (
              <div
                className={`${day.inMonth ? "" : "outside"}${day.count > 0 ? " checked" : ""}`}
                key={day.date}
                title={`${day.date} 完成 ${day.count} 个习惯`}
              >
                <span>{Number(day.date.slice(-2))}</span>
                {day.count > 0 ? <small>{day.count}</small> : null}
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="section-band">
        <SectionHeader title="历史补记与请假" />
        <HabitCorrection />
      </section>
      <HabitDialog onClose={() => setDialogOpen(false)} open={dialogOpen} />
    </div>
  )
}
