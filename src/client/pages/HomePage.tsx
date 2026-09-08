import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCw, Sparkles, Target } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { gainSchema, quoteSchema } from "../../shared/app.js"
import type { Item } from "../../shared/items.js"
import { useAppActions, useAppTime } from "../components/AppContext.js"
import { HabitRow } from "../components/HabitRow.js"
import { HomePinnedProjects } from "../components/HomePinnedProjects.js"
import { HomeSky } from "../components/HomeSky.js"
import { HomeTodaySection } from "../components/HomeTodaySection.js"
import { OrganizeDialog } from "../components/OrganizeDialog.js"
import { SectionHeader } from "../components/PageHeader.js"
import { QuickStartGuide } from "../components/QuickStartGuide.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { Toast } from "../components/ui/Feedback.js"
import { YesterdayReview } from "../components/YesterdayReview.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { formatSkyGreeting, greetingForHour, hourInTimeZone } from "../lib/greeting.js"
import { useHabitMutation } from "../lib/mutations.js"
import {
  queryKeys,
  useGains,
  useHabits,
  useItems,
  useMeta,
  useProjects,
  useQuote,
} from "../lib/queries.js"

export function HomePage() {
  const actions = useAppActions()
  const meta = useMeta()
  const { timezone, today: localToday } = useAppTime()
  const client = useQueryClient()
  const today = useItems("today")
  const habits = useHabits()
  const projects = useProjects()
  const gains = useGains(localToday)
  const quote = useQuote()
  const record = useHabitMutation("record")
  const undo = useHabitMutation("undo")
  const [gain, setGain] = useState("")
  const [editing, setEditing] = useState<Item | null>(null)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  useEffect(() => {
    if (statusNotice === null) return
    const timer = window.setTimeout(() => setStatusNotice(null), 4_000)
    return () => window.clearTimeout(timer)
  }, [statusNotice])
  const addGain = useMutation({
    mutationFn: () =>
      apiRequest("/api/gains", gainSchema, {
        method: "POST",
        body: jsonBody({ localDate: localToday, content: gain }),
      }),
    onSuccess: () => {
      setGain("")
      void client.invalidateQueries({ queryKey: queryKeys.gains })
    },
  })
  const nextQuote = useMutation({
    mutationFn: () =>
      apiRequest("/api/quote/next", quoteSchema.nullable(), {
        method: "POST",
        body: jsonBody({ localDate: localToday }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["quote"] }),
  })
  const activeToday = today.data?.filter((item) => item.status === "active") ?? []
  const primaryToday = activeToday.filter((item) => !item.isSecondary)
  const secondaryToday = activeToday.filter((item) => item.isSecondary)
  const completedToday = today.data?.filter((item) => item.status === "completed") ?? []
  const todayHabits = habits.data?.filter((habit) => habit.scheduledToday) ?? []
  const completedHabits = todayHabits.filter((habit) => habit.completedToday).length
  const announceCompletion = (item: Item) =>
    setStatusNotice(`“${item.title}”已完成，可在“已完成”中找回。`)
  const now = new Date()
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now)
  const greeting = greetingForHour(hourInTimeZone(now, timezone))
  const userName = meta.data?.settings.userName ?? "你"
  const tasksTotal = activeToday.length + completedToday.length
  return (
    <div className="page page--home">
      <HomeSky
        actions={
          <Button onClick={actions.openCapture}>
            <Plus size={16} />
            随手记
          </Button>
        }
        dateText={dateText}
        greeting={formatSkyGreeting(greeting, userName)}
        metrics={{
          habitsDone: completedHabits,
          habitsTotal: todayHabits.length,
          harvestCount: gains.data?.length ?? 0,
          tasksDone: completedToday.length,
          tasksTotal,
        }}
        subtitle="把注意力留给此刻真正重要的事。"
      />
      {statusNotice === null ? null : (
        <Toast>
          <span>{statusNotice}</span>
          <Link className="text-action" to="/todos?view=completed">
            查看已完成
          </Link>
        </Toast>
      )}
      {meta.data?.tutorial.guideDismissed === false ? <QuickStartGuide /> : null}
      <section className="quote-band">
        <Sparkles aria-hidden="true" size={18} />
        <blockquote>{quote.data?.content ?? "先记下一件小事，今天就从这里开始。"}</blockquote>
        <button
          aria-label="换一句每日短语"
          onClick={() => nextQuote.mutate()}
          title="换一句"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </section>
      <YesterdayReview />
      <div className="home-grid">
        <div className="home-primary">
          <HomeTodaySection
            lists={{
              completed: completedToday,
              primary: primaryToday,
              secondary: secondaryToday,
            }}
            onCompleted={announceCompletion}
            onEdit={setEditing}
          />
          <section className="section-band">
            <SectionHeader
              action={
                <span className="section-count">
                  {completedHabits}/{todayHabits.length}
                </span>
              }
              title="今日习惯"
            />
            {todayHabits.length === 0 ? (
              <EmptyState
                action={
                  <Link className="button button--secondary button--compact" to="/habits">
                    新习惯
                  </Link>
                }
                description="从一件很小的事开始。"
                icon={Target}
                title="今天没有习惯"
              />
            ) : (
              <div className="list-stack">
                {todayHabits.map((habit) => (
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
        </div>
        <aside className="home-secondary">
          <section className="section-band">
            <SectionHeader
              action={
                <Link className="text-action" to="/projects">
                  全部项目
                </Link>
              }
              title="周期项目"
            />
            <div className="project-summary-list">
              <HomePinnedProjects projects={projects.data} />
            </div>
          </section>
          <section className="section-band">
            <SectionHeader title="今日收获" />
            <form
              className="gain-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (gain.trim()) addGain.mutate()
              }}
            >
              <input
                aria-label="写下今日收获"
                maxLength={500}
                onChange={(event) => setGain(event.target.value)}
                placeholder="今天有什么值得留下？"
                value={gain}
              />
              <Button
                disabled={!gain.trim()}
                loading={addGain.isPending}
                size="compact"
                type="submit"
              >
                记下
              </Button>
            </form>
            <div className="gain-list">
              {gains.data?.slice(0, 4).map((entry) => (
                <article key={entry.id}>
                  <time>
                    {new Date(entry.createdAt).toLocaleTimeString("zh-CN", {
                      timeZone: timezone,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <p>{entry.content}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <OrganizeDialog item={editing} mode="edit" onClose={() => setEditing(null)} />
    </div>
  )
}
