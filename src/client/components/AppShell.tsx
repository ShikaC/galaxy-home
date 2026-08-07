import {
  Archive,
  CheckSquare2,
  FolderKanban,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Search,
  Settings,
  Sparkles,
  Target,
} from "lucide-react"
import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react"
import { NavLink, Outlet } from "react-router"
import { localDateFor } from "../lib/date.js"
import { useMeta } from "../lib/queries.js"
import { OnboardingPage } from "../pages/OnboardingPage.js"
import { AiDrawer } from "./AiDrawer.js"
import { AppActionsContext, AppTimeContext } from "./AppContext.js"
import { CaptureDialog } from "./CaptureDialog.js"
import { ReminderBanner } from "./ReminderBanner.js"
import { SearchDialog } from "./SearchDialog.js"
import { IconButton } from "./ui/IconButton.js"

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: Home, end: true },
  { to: "/todos", label: "待办", icon: CheckSquare2, end: false },
  { to: "/projects", label: "项目", icon: FolderKanban, end: false },
  { to: "/habits", label: "习惯", icon: Target, end: false },
  { to: "/review", label: "回顾", icon: Archive, end: false },
] as const

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
  const [captureOpen, setCaptureOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiConversationId, setAiConversationId] = useState<string | null>(null)
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const [aiFocusItemId, setAiFocusItemId] = useState<string | null>(null)
  const [aiWidth, setAiWidth] = useState(readAiDrawerWidth)
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

  if (meta.isLoading) return <div className="page-loading">正在打开你的空间...</div>
  if (meta.isError || meta.data === undefined)
    return (
      <div className="page-loading page-loading--error">无法连接本地服务，请确认服务仍在运行。</div>
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
    <AppTimeContext.Provider value={time}>
      <AppActionsContext.Provider value={actions}>
        <div className={shellClassName} style={shellStyle}>
          <aside
            className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}
            data-app-background
          >
            <div className="brand">
              <span className="brand-mark">
                <Sparkles size={18} />
              </span>
              <strong>银河居所</strong>
            </div>
            <p className="workspace-name">{meta.data.settings.workspaceName}</p>
            <nav aria-label="主导航">
              {NAV_ITEMS.map(({ end, icon: Icon, label, to }) => (
                <NavLink
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
            </nav>
            <div className="sidebar__bottom">
              <button
                aria-label={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
                className="nav-item"
                onClick={() => setSidebarCollapsed((current) => !current)}
                title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
                type="button"
              >
                {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                <span>{sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}</span>
              </button>
              <button
                aria-label="全局搜索"
                className="nav-item"
                onClick={() => setSearchOpen(true)}
                type="button"
              >
                <Search aria-hidden="true" size={18} />
                <span>全局搜索</span>
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
          <main className="main-scroll" data-app-background>
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
        </div>
      </AppActionsContext.Provider>
    </AppTimeContext.Provider>
  )
}
