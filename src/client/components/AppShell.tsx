import type { LucideIcon } from "lucide-react"
import {
  Archive,
  BookOpen,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  Command,
  FileText,
  FolderKanban,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react"
import {
  type CSSProperties,
  type PointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router"
import { localDateFor } from "../lib/date.js"
import { useMeta, useProjects } from "../lib/queries.js"
import { OnboardingPage } from "../pages/OnboardingPage.js"
import { AiDrawer } from "./AiDrawer.js"
import { AppActionsContext, AppAppearanceContext, AppTimeContext } from "./AppContext.js"
import { CaptureDialog } from "./CaptureDialog.js"
import { ItemDeepLink } from "./ItemDeepLink.js"
import { ReminderBanner } from "./ReminderBanner.js"
import { SearchDialog } from "./SearchDialog.js"
import { Button } from "./ui/Button.js"
import { IconButton } from "./ui/IconButton.js"

type NavItem = {
  readonly to: string
  readonly label: string
  readonly icon: LucideIcon
  readonly end: boolean
}

type NavSection = {
  readonly label?: string
  readonly items: readonly NavItem[]
}

// 日常使用的清单能力排在前面，AI 与知识相关入口收进同一分组，
// 避免一级导航被九个平铺入口摊平。
const NAV_SECTIONS: readonly NavSection[] = [
  {
    items: [
      { to: "/", label: "工作台", icon: Home, end: true },
      { to: "/todos", label: "任务", icon: CheckSquare2, end: false },
      { to: "/calendar", label: "日历", icon: CalendarDays, end: false },
      { to: "/projects", label: "项目", icon: FolderKanban, end: false },
      { to: "/habits", label: "习惯", icon: Target, end: false },
      { to: "/review", label: "回顾", icon: Archive, end: false },
    ],
  },
  {
    label: "AI 与知识",
    items: [
      { to: "/task-plans", label: "AI 任务", icon: Sparkles, end: false },
      { to: "/plans", label: "知识计划", icon: BookOpen, end: false },
      { to: "/notes", label: "知识笔记", icon: FileText, end: false },
    ],
  },
]

const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items)

import {
  applyTheme,
  nextTheme,
  persistTheme,
  readStoredTheme,
  type ThemeName,
} from "../lib/theme.js"

const AI_DRAWER_WIDTH_KEY = "galaxy:ai-drawer-width"
const AI_DRAWER_WIDTH_DEFAULT = 360
const AI_DRAWER_WIDTH_MIN = 280
const AI_DRAWER_WIDTH_MAX = 560

function clampAiDrawerWidth(value: number): number {
  return Math.min(AI_DRAWER_WIDTH_MAX, Math.max(AI_DRAWER_WIDTH_MIN, value))
}

function readAiDrawerWidth(): number {
  const raw = window.localStorage.getItem(AI_DRAWER_WIDTH_KEY)
  if (raw === null) return AI_DRAWER_WIDTH_DEFAULT
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? clampAiDrawerWidth(parsed) : AI_DRAWER_WIDTH_DEFAULT
}

export function AppShell() {
  const meta = useMeta()
  const projects = useProjects()
  const location = useLocation()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiConversationId, setAiConversationId] = useState<string | null>(null)
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const [aiFocusItemId, setAiFocusItemId] = useState<string | null>(null)
  const [aiWidth, setAiWidth] = useState(readAiDrawerWidth)
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme)
  const toggleTheme = useCallback(() => setTheme((current) => nextTheme(current)), [])
  const appearance = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme])
  useEffect(() => {
    applyTheme(theme)
    persistTheme(theme)
  }, [theme])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem("galaxy:sidebar-collapsed") === "1",
  )
  const [clockTick, setClockTick] = useState(() => Date.now())
  const timezone = meta.data?.settings.timezone ?? "UTC"
  const time = useMemo(
    () => ({ timezone, today: localDateFor(timezone, new Date(clockTick)) }),
    [clockTick, timezone],
  )
  const actions = useMemo(
    () => ({
      openCapture: () => setCaptureOpen(true),
      openSearch: () => setSearchOpen(true),
      openAi: (options?: {
        readonly conversationId?: string
        readonly draft?: string
        readonly focusItemId?: string
      }) => {
        setAiConversationId(options?.conversationId ?? null)
        setAiDraft(options?.draft ?? null)
        setAiFocusItemId(options?.focusItemId ?? null)
        setAiOpen(true)
      },
    }),
    [],
  )
  const clearAiDraft = useCallback(() => setAiDraft(null), [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault()
        setCaptureOpen(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault()
        setAiOpen((current) => !current)
        return
      }
      if (event.key === "Escape") {
        setCaptureOpen(false)
        setSearchOpen(false)
        setAiOpen(false)
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      event.preventDefault()
      if (event.shiftKey) setSearchOpen(true)
      else setCaptureOpen(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
  useEffect(() => {
    window.localStorage.setItem("galaxy:sidebar-collapsed", sidebarCollapsed ? "1" : "0")
  }, [sidebarCollapsed])
  useEffect(() => {
    window.localStorage.setItem(AI_DRAWER_WIDTH_KEY, String(aiWidth))
  }, [aiWidth])
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const onAiResizePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = aiWidth
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setAiWidth(clampAiDrawerWidth(startWidth + (startX - moveEvent.clientX)))
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  if (meta.isLoading)
    return (
      <div aria-live="polite" className="page-loading" role="status">
        正在连接本地服务...
      </div>
    )
  if (meta.isError || meta.data === undefined)
    return (
      <div aria-live="assertive" className="page-loading page-loading--error" role="alert">
        <p>无法连接本地服务，请确认服务仍在运行。</p>
        <Button loading={meta.isFetching} onClick={() => void meta.refetch()} variant="secondary">
          <RefreshCw size={16} />
          重试连接
        </Button>
      </div>
    )
  if (!meta.data.settings.onboardingCompleted) return <OnboardingPage />

  const shellClassName = [
    "app-shell",
    sidebarCollapsed ? "app-shell--sidebar-collapsed" : "",
    aiOpen ? "app-shell--ai-open" : "",
  ]
    .filter(Boolean)
    .join(" ")
  const shellStyle = {
    "--ai-panel-width": `${aiWidth}px`,
  } as CSSProperties

  return (
    <AppAppearanceContext.Provider value={appearance}>
      <AppTimeContext.Provider value={time}>
        <AppActionsContext.Provider value={actions}>
          <div className={shellClassName} style={shellStyle}>
            <a className="skip-link" href="#workspace-main">
              跳到主要内容
            </a>
            <aside
              className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}
              data-app-background
            >
              <div className="brand">
                <span className="brand-mark">
                  <span className="orbit-mark" />
                </span>
                <strong>
                  galaxy<span>个人工作空间</span>
                </strong>
              </div>
              <Link className="workspace-name" to="/settings">
                <span className="workspace-avatar">
                  {meta.data.settings.workspaceName.slice(0, 1)}
                </span>
                <span>{meta.data.settings.workspaceName}</span>
                <ChevronDown size={13} />
              </Link>
              <button
                className="sidebar-search"
                type="button"
                aria-label="全局搜索"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} />
                <span>搜索任何内容</span>
                <kbd>⌘ ⇧ K</kbd>
              </button>
              <button
                aria-label="记录新想法"
                className="sidebar-create"
                type="button"
                onClick={() => setCaptureOpen(true)}
              >
                <Plus size={16} />
                <span>记录新想法</span>
                <kbd>⌘ K</kbd>
              </button>
              <p className="sidebar-label">我的工作空间</p>
              <nav aria-label="主导航">
                {NAV_SECTIONS.map((section) => (
                  <div className="nav-section" key={section.label ?? "core"}>
                    {section.label === undefined ? null : (
                      <p className="sidebar-label">{section.label}</p>
                    )}
                    {section.items.map(({ end, icon: Icon, label, to }) => (
                      <NavLink
                        aria-label={label}
                        className={({ isActive, isPending }) =>
                          `nav-item${isActive ? " nav-item--active" : ""}${isPending ? " nav-item--pending" : ""}`
                        }
                        end={end}
                        key={to}
                        to={to}
                        title={label}
                      >
                        <Icon aria-hidden="true" size={18} />
                        <span>{label}</span>
                      </NavLink>
                    ))}
                  </div>
                ))}
              </nav>
              <div className="sidebar-projects">
                <p className="sidebar-label">
                  正在进行{" "}
                  <span>
                    {projects.data?.filter((project) => project.status === "active").length ?? 0}
                  </span>
                </p>
                {projects.data
                  ?.filter((project) => project.status === "active")
                  .slice(0, 4)
                  .map((project, index) => (
                    <Link key={project.id} to={`/projects/${project.id}`}>
                      <span className={`project-dot project-dot--${index % 3}`} />
                      <span>{project.name}</span>
                    </Link>
                  ))}
                <Link to="/projects">
                  <Plus size={13} />
                  <span>探索项目空间</span>
                </Link>
              </div>
              <div className="sidebar__bottom">
                <button
                  aria-label="和 AI 一起思考"
                  className="sidebar-ai"
                  type="button"
                  onClick={() => actions.openAi()}
                >
                  <Sparkles size={17} />
                  <span>
                    和 AI 一起思考<small>让下一步更清晰</small>
                  </span>
                  <kbd>⌘ J</kbd>
                </button>
                <button
                  aria-label={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
                  className="nav-item"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
                  type="button"
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen aria-hidden="true" size={18} />
                  ) : (
                    <PanelLeftClose aria-hidden="true" size={18} />
                  )}
                  <span>{sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}</span>
                </button>

                <NavLink
                  aria-label="设置"
                  className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
                  to="/settings"
                  title="设置"
                >
                  <Settings aria-hidden="true" size={18} />
                  <span>设置</span>
                </NavLink>
              </div>
            </aside>
            <main className="main-scroll" data-app-background id="workspace-main">
              <header className="workspace-toolbar">
                <div>
                  <Command size={15} />
                  <span>{meta.data.settings.workspaceName}</span>
                  <span className="toolbar-slash">/</span>
                  <strong>
                    {NAV_ITEMS.find((item) =>
                      item.to === "/"
                        ? location.pathname === "/"
                        : location.pathname.startsWith(item.to),
                    )?.label ?? "设置"}
                  </strong>
                </div>
                <div>
                  <Link className="toolbar-settings" aria-label="设置" to="/settings">
                    <Settings size={16} />
                  </Link>
                  <span className="local-status">
                    <ShieldCheck size={13} />
                    本地优先
                  </span>
                  <button type="button" aria-label="打开 AI 助手" onClick={() => actions.openAi()}>
                    <Sparkles size={15} />
                    <span>AI 助手</span>
                  </button>
                </div>
              </header>
              <ReminderBanner />
              <Suspense fallback={<p className="page-loading">正在打开你的空间...</p>}>
                <Outlet />
              </Suspense>
            </main>
            {aiOpen ? (
              <div className="ai-panel" data-app-background>
                <button
                  aria-label="调整 AI 侧栏宽度"
                  className="ai-panel__resize"
                  onPointerDown={onAiResizePointerDown}
                  type="button"
                />
                <AiDrawer
                  draft={aiDraft}
                  focusItemId={aiFocusItemId}
                  onClose={() => {
                    setAiOpen(false)
                    setAiDraft(null)
                    setAiFocusItemId(null)
                  }}
                  onConversationChange={setAiConversationId}
                  onDraftConsumed={clearAiDraft}
                  open={aiOpen}
                  requestedConversationId={aiConversationId}
                />
              </div>
            ) : (
              <aside className="ai-rail" data-app-background>
                <IconButton
                  label={`打开 ${meta.data.settings.aiNickname}`}
                  onClick={() => setAiOpen(true)}
                >
                  <PanelRightOpen size={19} />
                </IconButton>
                <span>AI</span>
              </aside>
            )}
            <CaptureDialog onClose={() => setCaptureOpen(false)} open={captureOpen} />
            <SearchDialog onClose={() => setSearchOpen(false)} open={searchOpen} />
            <ItemDeepLink />
          </div>
        </AppActionsContext.Provider>
      </AppTimeContext.Provider>
    </AppAppearanceContext.Provider>
  )
}
