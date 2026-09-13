import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  Circle,
  FileText,
  FolderKanban,
  Inbox,
  Layers3,
  Plus,
  Sparkles,
  Sun,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import type { Item } from "../../shared/items.js"
import { useAppActions, useAppTime } from "../components/AppContext.js"
import { FocusTimer } from "../components/FocusTimer.js"
import { HabitRow } from "../components/HabitRow.js"
import { OrganizeDialog } from "../components/OrganizeDialog.js"
import { ProjectDialog } from "../components/ProjectDialog.js"
import { TaskRow } from "../components/TaskRow.js"
import { Button } from "../components/ui/Button.js"
import { useHabitMutation, useItemStatusMutation, useTodayMutation } from "../lib/mutations.js"
import { useHabits, useItems, useMeta, useNotes, useProjects } from "../lib/queries.js"

export function HomePage() {
  const actions = useAppActions()
  const meta = useMeta()
  const { timezone } = useAppTime()
  const today = useItems("today")
  const inbox = useItems("inbox")
  const projects = useProjects()
  const habits = useHabits()
  const notes = useNotes()
  const record = useHabitMutation("record")
  const undo = useHabitMutation("undo")
  const addToday = useTodayMutation()
  const itemStatus = useItemStatusMutation()
  const [view, setView] = useState<"today" | "inbox" | "completed">("today")
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState<Item | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const activeToday = today.data?.filter((item) => item.status === "active") ?? []
  const completed = today.data?.filter((item) => item.status === "completed") ?? []
  const activeProjects = projects.data?.filter((project) => project.status === "active") ?? []
  const todayHabits = habits.data?.filter((habit) => habit.scheduledToday) ?? []
  const visibleTasks =
    view === "inbox" ? (inbox.data ?? []) : view === "completed" ? completed : activeToday
  const date = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date())
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  )
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好"
  const userName = meta.data?.settings.userName
  const taskError = today.error ?? inbox.error ?? itemStatus.error ?? addToday.error
  return (
    <div className="page workspace-home">
      <header className="daily-heading">
        <div>
          <div className="daily-heading__date">
            <Sun size={15} />
            {date}
            <span>YOUR SPACE, YOUR PACE</span>
          </div>
          <h1>
            {greeting}
            {userName && userName !== "你" ? `，${userName}` : "，欢迎回到你的空间"}
            <span className="greeting-dot">.</span>
          </h1>
          <p>
            {activeToday.length > 0
              ? `今天有 ${activeToday.length} 件事值得专注。一步一步，让想法发生。`
              : "清空脑海，安放想法。从一件重要的小事开始。"}
          </p>
        </div>
        <Button aria-label="随手记" variant="secondary" onClick={actions.openCapture}>
          <Plus size={16} />
          随手记<kbd>⌘ K</kbd>
        </Button>
      </header>
      <section className="ai-launchpad" aria-label="AI 工作入口">
        <div className="ai-launchpad__heading">
          <span className="ai-emblem">
            <Sparkles size={20} />
          </span>
          <div>
            <h2>把想法交给 AI，把精力留给创造。</h2>
            <p>从一句话开始，理清思路、拆解计划，或者找到下一步。</p>
          </div>
          <span className="ai-label">GALAXY AI</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.trim()) {
              actions.openAi({ draft: draft.trim() })
              setDraft("")
            }
          }}
        >
          <input
            aria-label="告诉 AI 你想做什么"
            value={draft}
            maxLength={18_000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="今天想推进什么？或者，把脑海中的想法放在这里…"
          />
          <button aria-label="与 AI 继续这个想法" type="submit" disabled={!draft.trim()}>
            <ArrowUpRight size={20} />
          </button>
        </form>
        <div className="ai-launchpad__suggestions">
          <Link className="plan-next-link" to="/plans">
            <Sparkles size={13} />
            生成行动计划
            <ArrowUpRight size={12} />
          </Link>
          <span>试着问</span>
          {[
            {
              icon: Layers3,
              label: "规划今天",
              prompt:
                "请结合整个工作空间的待办和项目，帮我规划今天最值得推进的三件事，解释优先顺序。",
            },
            {
              icon: FolderKanban,
              label: "拆解一个目标",
              prompt:
                "我想把一个目标变成可以执行的项目。请先问我目标和预期成果，再一起拆解下一步。",
            },
            {
              icon: BookOpen,
              label: "梳理我的知识",
              prompt: "请查看工作空间的笔记，总结目前的主题，指出可以连接起来的想法。",
            },
          ].map(({ icon: Icon, label, prompt }) => (
            <button type="button" key={label} onClick={() => actions.openAi({ draft: prompt })}>
              <Icon size={13} />
              {label}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      </section>
      <div className="workspace-grid">
        <div className="workspace-primary">
          <section className="work-section">
            <header className="work-section__heading">
              <h2>
                把今天，过得有条理<span>TODAY'S FOCUS</span>
              </h2>
              <Link to="/todos">
                全部任务
                <ArrowUpRight size={14} />
              </Link>
            </header>
            <fieldset className="work-tabs" aria-label="任务视图">
              {[
                { id: "today", label: "今日计划", count: activeToday.length, icon: Circle },
                { id: "inbox", label: "收集箱", count: inbox.data?.length ?? 0, icon: Inbox },
                { id: "completed", label: "已完成", count: completed.length, icon: CheckCheck },
              ].map(({ id, label, count, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={view === id}
                  onClick={() => {
                    if (id === "today" || id === "inbox" || id === "completed") setView(id)
                  }}
                >
                  <Icon size={14} />
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </fieldset>
            {taskError ? (
              <p className="inline-error" role="alert">
                {taskError.message}
                <Button
                  variant="ghost"
                  onClick={() => {
                    void today.refetch()
                    void inbox.refetch()
                  }}
                >
                  重试
                </Button>
              </p>
            ) : null}
            {today.isLoading || inbox.isLoading ? (
              <div className="workspace-skeleton" role="status">
                正在整理今日计划…
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="work-empty">
                <span className="work-empty__icon">
                  {view === "completed" ? <Check size={22} /> : <ArrowDownLeft size={22} />}
                </span>
                <div>
                  <h3>
                    {view === "completed"
                      ? "每一个完成，都值得被看见"
                      : view === "inbox"
                        ? "脑海里的事，都可以先放这里"
                        : "留白，是一个很好的开始"}
                  </h3>
                  <p>
                    {view === "completed"
                      ? "完成的今日任务会出现在这里。"
                      : view === "inbox"
                        ? "先记下来，不必立刻决定怎么做。"
                        : "从收集箱挑一件事，或记下今天的第一个计划。"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="workspace-task-list">
                {visibleTasks.slice(0, 7).map((item) => (
                  <div className="workspace-task" key={item.id}>
                    <TaskRow
                      item={item}
                      onComplete={() => {
                        if (!itemStatus.isPending)
                          itemStatus.mutate({
                            id: item.id,
                            expectedVersion: item.version,
                            status: item.status === "completed" ? "active" : "completed",
                          })
                      }}
                      onEdit={() => setEditing(item)}
                      onToday={() =>
                        addToday.mutate({
                          id: item.id,
                          expectedVersion: item.version,
                          focus: false,
                        })
                      }
                      onFocus={() =>
                        addToday.mutate({ id: item.id, expectedVersion: item.version, focus: true })
                      }
                    />
                    <button
                      className="task-ai-action"
                      type="button"
                      aria-label={`和 AI 讨论 ${item.title}`}
                      onClick={() =>
                        actions.openAi({
                          focusItemId: item.id,
                          draft: `帮我理清「${item.title}」的下一步，给出可以立即开始的具体行动。`,
                        })
                      }
                    >
                      <Sparkles size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {visibleTasks.length > 7 ? (
              <Link
                className="text-action"
                to={view === "today" ? "/todos?view=today" : `/todos?view=${view}`}
              >
                查看其余 {visibleTasks.length - 7} 项
              </Link>
            ) : null}
            <button className="inline-create" type="button" onClick={actions.openCapture}>
              <Plus size={15} />
              记下一件事<span>让想法有个落点</span>
            </button>
            {today.data && today.data.length > 0 ? (
              <div className="daily-progress">
                <div>
                  <span style={{ width: `${(completed.length / today.data.length) * 100}%` }} />
                </div>
                <span>
                  今日已完成 {completed.length} / {today.data.length}
                </span>
              </div>
            ) : null}
          </section>
          <section className="work-section">
            <header className="work-section__heading">
              <h2>
                正在发生的事<span>IN MOTION</span>
              </h2>
              <Link to="/projects">
                项目空间
                <ArrowUpRight size={14} />
              </Link>
            </header>
            {projects.isError ? (
              <p className="inline-error">
                项目暂时无法加载。
                <Button variant="ghost" onClick={() => void projects.refetch()}>
                  重试
                </Button>
              </p>
            ) : activeProjects.length === 0 ? (
              <button
                className="project-empty-start"
                type="button"
                onClick={() => setProjectOpen(true)}
              >
                <span>
                  <FolderKanban size={22} />
                </span>
                <div>
                  <strong>把一个想法，变成真正的项目</strong>
                  <p>写下想抵达的地方，和 AI 一起找到路径。</p>
                </div>
                <Plus size={18} />
              </button>
            ) : (
              <div className="workspace-projects">
                {activeProjects.slice(0, 4).map((project, index) => (
                  <Link
                    key={project.id}
                    className={`workspace-project workspace-project--${index % 3}`}
                    to={`/projects/${project.id}`}
                  >
                    <div className="workspace-project__top">
                      <span>
                        <FolderKanban size={19} />
                      </span>
                      <ArrowUpRight size={15} />
                    </div>
                    <h3>{project.name}</h3>
                    <p>
                      {project.currentTask?.title ??
                        project.stageTitle ??
                        project.desiredOutcome ??
                        "定义你的下一步"}
                    </p>
                    <footer>
                      <span>{project.stageTitle || "进行中"}</span>
                      <span>
                        {project.progress}%{" "}
                        <small>{project.progressSource === "ai" ? "AI 估算" : "手动推进"}</small>
                      </span>
                    </footer>
                    <div className="project-progress-track">
                      <span style={{ width: `${project.progress}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section className="work-section">
            <header className="work-section__heading">
              <h2>
                让灵感，慢慢生长<span>RECENT NOTES</span>
              </h2>
              <Link to="/notes">
                知识笔记
                <ArrowUpRight size={14} />
              </Link>
            </header>
            {notes.isError ? (
              <p className="inline-error">
                笔记暂时无法加载。
                <Button variant="ghost" onClick={() => void notes.refetch()}>
                  重试
                </Button>
              </p>
            ) : notes.data?.length ? (
              <div className="recent-notes">
                {notes.data.slice(0, 3).map((note) => (
                  <Link key={note.id} to={`/notes?note=${note.id}`}>
                    <FileText size={18} />
                    <div>
                      <strong>{note.title}</strong>
                      <p>{note.content.slice(0, 80) || "等待新的想法"}</p>
                    </div>
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              </div>
            ) : (
              <Link className="note-empty-start" to="/notes">
                <FileText size={21} />
                <div>
                  <strong>你的下一次灵感，从这里开始</strong>
                  <p>记录想法、沉淀研究，让 AI 帮你发现连接。</p>
                </div>
                <ArrowRight size={17} />
              </Link>
            )}
          </section>
        </div>
        <aside className="workspace-context">
          <FocusTimer />
          <section className="workspace-habits">
            <header className="work-section__heading">
              <h2>小习惯，长期主义</h2>
              <Link to="/habits" aria-label="管理习惯">
                <ArrowUpRight size={16} />
              </Link>
            </header>
            <p className="section-caption">不必一下子走很远，只要一直在路上。</p>
            {todayHabits.length ? (
              todayHabits
                .slice(0, 4)
                .map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    onRecord={() => record.mutate(habit.id)}
                    onUndo={() => undo.mutate(habit.id)}
                  />
                ))
            ) : (
              <Link className="habit-empty-link" to="/habits">
                <Plus size={17} />
                <span>建立一个想坚持的小习惯</span>
              </Link>
            )}
            {habits.isError || record.isError || undo.isError ? (
              <p className="inline-error">
                {habits.error?.message ?? record.error?.message ?? undo.error?.message}
              </p>
            ) : null}
          </section>
          <section className="workspace-ai-status">
            <span className="ai-emblem">
              <Sparkles size={17} />
            </span>
            <div>
              <h3>{meta.data?.ai.configured ? "你的 AI 搭档，随时就绪" : "给工作空间，接上 AI"}</h3>
              <p>
                {meta.data?.ai.configured
                  ? "带着任务和笔记的上下文，陪你把想法往前推。"
                  : "连接你偏好的模型，让任务、项目和知识开始协同。"}
              </p>
              {meta.data?.ai.configured ? (
                <button type="button" onClick={() => actions.openAi()}>
                  开始对话
                  <ArrowRight size={13} />
                </button>
              ) : (
                <Link to="/settings?section=ai">
                  连接 AI 服务
                  <ArrowRight size={13} />
                </Link>
              )}
            </div>
          </section>
          <p className="workspace-footnote">
            A LITTLE SPACE.
            <br />
            FOR YOUR NEXT BIG THING.
          </p>
        </aside>
      </div>
      <OrganizeDialog mode="edit" item={editing} onClose={() => setEditing(null)} />
      <ProjectDialog open={projectOpen} onClose={() => setProjectOpen(false)} />
    </div>
  )
}
