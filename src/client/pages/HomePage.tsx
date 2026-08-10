import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, CheckSquare2, FolderKanban, Plus, RefreshCw, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { gainSchema, quoteSchema } from "../../shared/app.js"
import type { Item } from "../../shared/items.js"
import { useAppActions, useAppTime } from "../components/AppContext.js"
import { HabitRow } from "../components/HabitRow.js"
import { OrganizeDialog } from "../components/OrganizeDialog.js"
import { PageHeader, SectionHeader } from "../components/PageHeader.js"
import { QuickStartGuide } from "../components/QuickStartGuide.js"
import { TaskRow } from "../components/TaskRow.js"
import { TodayTaskList } from "../components/TodayTaskList.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { Toast } from "../components/ui/Feedback.js"
import { ProgressBar } from "../components/ui/Status.js"
import { YesterdayReview } from "../components/YesterdayReview.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { useHabitMutation, useItemStatusMutation } from "../lib/mutations.js"
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
  const itemStatus = useItemStatusMutation((item, change) => {
    if (change.status === "completed") announceCompletion(item)
  })
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date())
  return (
    <div className="page">
      <PageHeader
        actions={
          <Button onClick={actions.openCapture}>
            <Plus size={16} />
            随手记
          </Button>
        }
        eyebrow={dateText}
        subtitle="把注意力留给此刻真正重要的事。"
        title="今日空间"
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
          <section className="section-band">
            <SectionHeader
              action={
                <Link className="text-action" to="/todos">
                  整理待办 <ArrowRight size={15} />
                </Link>
              }
              title="今日待办"
            />
            {primaryToday.length === 0 ? (
              <EmptyState
                action={
                  <Button onClick={actions.openCapture} size="compact">
                    记下一件事
                  </Button>
                }
                description="从收集箱挑一件，或记下下一步。"
                icon={CheckSquare2}
                title="今天还很轻"
              />
            ) : (
              <TodayTaskList
                items={primaryToday}
                onCompleted={announceCompletion}
                onEdit={setEditing}
                onReordered={() => void client.invalidateQueries({ queryKey: ["items"] })}
              />
            )}
            {secondaryToday.length > 0 ? (
              <details className="secondary-fold" open>
                <summary>临时小事 {secondaryToday.length} 项</summary>
                {secondaryToday.map((item) => (
                  <TaskRow
                    item={item}
                    key={item.id}
                    onComplete={() => itemStatus.mutate({ id: item.id, status: "completed" })}
                    onEdit={() => setEditing(item)}
                  />
                ))}
              </details>
            ) : null}
            {completedToday.length > 0 ? (
              <details className="completed-fold">
                <summary>今日已完成 {completedToday.length} 项</summary>
                {completedToday.map((item) => (
                  <TaskRow
                    item={item}
                    key={item.id}
                    onComplete={() => itemStatus.mutate({ id: item.id, status: "active" })}
                    onEdit={() => setEditing(item)}
                  />
                ))}
              </details>
            ) : null}
          </section>
          <section className="section-band">
            <SectionHeader
              action={
                <span className="section-count">
                  {completedHabits}/{todayHabits.length}
                </span>
              }
              title="今日习惯"
            />
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
              {(() => {
                const pinned = projects.data
                  ?.filter((project) => project.status === "active" && project.pinned)
                  .slice(0, 3)
                if (pinned === undefined || pinned.length === 0) {
                  return (
                    <EmptyState
                      action={
                        <Link className="text-action" to="/projects">
                          去项目页置顶
                        </Link>
                      }
                      description="把正在推进的周期项目置顶后，会出现在这里。"
                      icon={FolderKanban}
                      title="还没有置顶项目"
                    />
                  )
                }
                return pinned.map((project) => (
                  <Link className="project-summary" key={project.id} to={`/projects/${project.id}`}>
                    <strong>{project.name}</strong>
                    <p>{project.currentTask?.title ?? "等待设置当前任务"}</p>
                    <ProgressBar
                      label={project.progressSource === "ai" ? "AI 估算" : "手动进度"}
                      value={project.progress}
                    />
                  </Link>
                ))
              })()}
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
              <textarea
                aria-label="写下今日收获"
                onChange={(event) => setGain(event.target.value)}
                placeholder="今天有什么值得留下？"
                rows={3}
                value={gain}
              />
              <Button
                disabled={!gain.trim()}
                loading={addGain.isPending}
                size="compact"
                type="submit"
              >
                追加记录
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
