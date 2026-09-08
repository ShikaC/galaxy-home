import { PanelRightOpen, RefreshCw } from "lucide-react"
import {
  type CSSProperties,
  type PointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Outlet } from "react-router"
import { localDateFor } from "../lib/date.js"
import { useMeta } from "../lib/queries.js"
import {
  applyTheme,
  nextTheme,
  persistTheme,
  readStoredTheme,
  type ThemeName,
} from "../lib/theme.js"
import { OnboardingPage } from "../pages/OnboardingPage.js"
import { AiDrawer } from "./AiDrawer.js"
import { AppActionsContext, AppAppearanceContext, AppTimeContext } from "./AppContext.js"
import { AppSidebar } from "./AppSidebar.js"
import { CaptureDialog } from "./CaptureDialog.js"
import { ReminderBanner } from "./ReminderBanner.js"
import { SearchDialog } from "./SearchDialog.js"
import { Button } from "./ui/Button.js"
import { IconButton } from "./ui/IconButton.js"

const AI_DRAWER_WIDTH_KEY = "galaxy:ai-drawer-width"
const AI_DRAWER_WIDTH_DEFAULT = 380
const AI_DRAWER_WIDTH_MIN = 300
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
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem("galaxy:sidebar-collapsed") === "1",
  )
  const [clockTick, setClockTick] = useState(() => Date.now())
  const timezone = meta.data?.settings.timezone ?? "UTC"
  const time = useMemo(
    () => ({ timezone, today: localDateFor(timezone, new Date(clockTick)) }),
    [clockTick, timezone],
  )
  const toggleTheme = useCallback(() => {
    setTheme((current) => nextTheme(current))
  }, [])
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
  const appearance = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, toggleTheme],
  )
  const clearAiDraft = useCallback(() => setAiDraft(null), [])
  const clockLabel = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(clockTick))

  useEffect(() => {
    applyTheme(theme)
    persistTheme(theme)
  }, [theme])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCaptureOpen(false)
        setSearchOpen(false)
        setAiOpen(false)
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.repeat) return
      const key = event.key.toLowerCase()
      if (key === "k") {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (key === "n") {
        event.preventDefault()
        setCaptureOpen(true)
      }
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
    const timer = window.setInterval(() => setClockTick(Date.now()), 30_000)
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
    <AppTimeContext.Provider value={time}>
      <AppActionsContext.Provider value={actions}>
        <AppAppearanceContext.Provider value={appearance}>
          <div className={shellClassName} style={shellStyle}>
            <a className="skip-link" href="#workspace-main">
              跳到主要内容
            </a>
            <AppSidebar
              clockLabel={clockLabel}
              collapsed={sidebarCollapsed}
              onOpenSearch={() => setSearchOpen(true)}
              onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
              onToggleTheme={toggleTheme}
              theme={theme}
              workspaceName={meta.data.settings.workspaceName}
            />
            <main className="main-scroll" data-app-background id="workspace-main">
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
        </AppAppearanceContext.Provider>
      </AppActionsContext.Provider>
    </AppTimeContext.Provider>
  )
}
