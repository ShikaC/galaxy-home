import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { Plus, Target } from "lucide-react"
import { useState } from "react"
import type { Habit } from "../../shared/habits.js"
import { useAppTime } from "../components/AppContext.js"
import { HabitCalendar, type HabitCalendarDay } from "../components/HabitCalendar.js"
import { HabitCorrection } from "../components/HabitCorrection.js"
import { HabitDialog } from "../components/HabitDialog.js"
import { HabitRow } from "../components/HabitRow.js"
import { HabitTrend } from "../components/HabitTrend.js"
import { PageHeader, SectionHeader } from "../components/PageHeader.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { apiRequest, apiVoid } from "../lib/api.js"
import { useHabitMutation } from "../lib/mutations.js"
import { useHabits } from "../lib/queries.js"
import { habitSchema, habitSummariesSchema } from "../lib/schemas.js"

function makeTrend(start: Date, end: Date, summaries: ReadonlyMap<string, number>) {
  const length = differenceInCalendarDays(end, start) + 1
  return Array.from({ length }, (_value, index) => {
    const date = format(addDays(start, index), "yyyy-MM-dd")
    return { date: date.slice(5), 完成习惯: summaries.get(date) ?? 0 }
  })
}

export function HabitsPage() {
  const { today } = useAppTime()
  const client = useQueryClient()
  const habits = useHabits()
  const record = useHabitMutation("record")
  const undo = useHabitMutation("undo")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [selectedDate, setSelectedDate] = useState(today)
  const currentDay = new Date(`${today}T12:00:00`)
  const monthStart = startOfMonth(currentDay)
  const weekStart = startOfWeek(currentDay, { weekStartsOn: 1 })
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(endOfMonth(currentDay), { weekStartsOn: 0 })
  const calendarStartDate = format(calendarStart, "yyyy-MM-dd")
  const weekStartDate = format(weekStart, "yyyy-MM-dd")
  const start = calendarStartDate < weekStartDate ? calendarStartDate : weekStartDate
  const end = format(calendarEnd, "yyyy-MM-dd")
  const summaries = useQuery({
    queryKey: ["habit-summaries", start, end],
    queryFn: () =>
      apiRequest(`/api/habits/summaries?start=${start}&end=${end}`, habitSummariesSchema),
  })
  const summaryMap = new Map(
    summaries.data?.map((entry) => [entry.localDate, entry.completedHabits]),
  )
  const weekTrend = makeTrend(weekStart, currentDay, summaryMap)
  const monthTrend = makeTrend(monthStart, currentDay, summaryMap)
  const calendarLength = differenceInCalendarDays(calendarEnd, calendarStart) + 1
  const calendar: readonly HabitCalendarDay[] = Array.from(
    { length: calendarLength },
    (_, index) => {
      const date = format(addDays(calendarStart, index), "yyyy-MM-dd")
      return {
        date,
        inMonth: date.slice(0, 7) === today.slice(0, 7),
        count: summaryMap.get(date) ?? 0,
      }
    },
  )
  const copy = useMutation({
    mutationFn: (habit: Habit) =>
      apiRequest(`/api/habits/${habit.id}/copy`, habitSchema, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: ["habit-day"] })
    },
  })
  const remove = useMutation({
    mutationFn: (habit: Habit) => apiVoid(`/api/habits/${habit.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: ["habit-day"] })
      void client.invalidateQueries({ queryKey: ["habit-summaries"] })
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  return (
    <div className="page">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setEditingHabit(null)
              setDialogOpen(true)
            }}
          >
            <Plus size={16} />
            新习惯
          </Button>
        }
        subtitle="休息和请假不打断连续；所有统计都以修正后的记录为准。"
        title="习惯"
      />
      <section className="section-band">
        <SectionHeader title="当前习惯" />
        {habits.data?.length === 0 ? (
          <EmptyState
            action={
              <Button
                onClick={() => {
                  setEditingHabit(null)
                  setDialogOpen(true)
                }}
                size="compact"
              >
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
                onCopy={() => copy.mutate(habit)}
                onDelete={() => remove.mutate(habit)}
                onEdit={() => {
                  setEditingHabit(habit)
                  setDialogOpen(true)
                }}
                onRecord={() => record.mutate(habit.id)}
                onUndo={() => undo.mutate(habit.id)}
              />
            ))}
          </div>
        )}
      </section>
      <div className="analytics-grid">
        <div className="trend-stack">
          <HabitTrend data={weekTrend} title="本周趋势" />
          <HabitTrend data={monthTrend} title="本月趋势" />
        </div>
        <HabitCalendar
          days={calendar}
          onSelect={setSelectedDate}
          selectedDate={selectedDate}
          today={today}
        />
      </div>
      {copy.isError || remove.isError ? (
        <p className="inline-error">{copy.error?.message ?? remove.error?.message}</p>
      ) : null}
      <section className="section-band">
        <SectionHeader title="历史补记与请假" />
        <HabitCorrection initialDate={selectedDate} />
      </section>
      <HabitDialog habit={editingHabit} onClose={() => setDialogOpen(false)} open={dialogOpen} />
    </div>
  )
}
