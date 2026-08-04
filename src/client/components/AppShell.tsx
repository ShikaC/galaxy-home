import {
  Archive,
  CheckSquare2,
  FolderKanban,
  Home,
  PanelRightOpen,
  Search,
  Settings,
  Sparkles,
  Target,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
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

export function AppShell() {
  const meta = useMeta()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
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
      openAi: () => setAiOpen(true),
    }),
    [],
  )
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
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  if (meta.isLoading) return <div className="page-loading">正在打开你的空间...</div>
  if (meta.isError || meta.data === undefined)
    return (
      <div className="page-loading page-loading--error">无法连接本地服务，请确认服务仍在运行。</div>
    )
  if (!meta.data.settings.onboardingCompleted) return <OnboardingPage />

  return (
    <AppTimeContext.Provider value={time}>
      <AppActionsContext.Provider value={actions}>
        <div className="app-shell">
          <aside className="sidebar">
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
                  className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
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
          <main className="main-scroll">
            <ReminderBanner />
            <Outlet />
          </main>
          <aside className="ai-rail">
            <IconButton
              label={`打开 ${meta.data.settings.aiNickname}`}
              onClick={() => setAiOpen(true)}
            >
              <PanelRightOpen size={19} />
            </IconButton>
            <span>AI</span>
          </aside>
          <CaptureDialog onClose={() => setCaptureOpen(false)} open={captureOpen} />
          <SearchDialog onClose={() => setSearchOpen(false)} open={searchOpen} />
          <AiDrawer onClose={() => setAiOpen(false)} open={aiOpen} />
        </div>
      </AppActionsContext.Provider>
    </AppTimeContext.Provider>
  )
}
