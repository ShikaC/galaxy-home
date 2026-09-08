import {
  Archive,
  CheckSquare2,
  FolderKanban,
  Home,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  Target,
} from "lucide-react"
import { NavLink } from "react-router"
import type { ThemeName } from "../lib/theme.js"
import { BrandMark } from "./BrandMark.js"

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: Home, end: true },
  { to: "/todos", label: "待办", icon: CheckSquare2, end: false },
  { to: "/projects", label: "项目", icon: FolderKanban, end: false },
  { to: "/habits", label: "习惯", icon: Target, end: false },
  { to: "/review", label: "回顾", icon: Archive, end: false },
] as const

export function AppSidebar({
  clockLabel,
  collapsed,
  onOpenSearch,
  onToggleCollapsed,
  onToggleTheme,
  theme,
  workspaceName,
}: {
  readonly clockLabel: string
  readonly collapsed: boolean
  readonly onOpenSearch: () => void
  readonly onToggleCollapsed: () => void
  readonly onToggleTheme: () => void
  readonly theme: ThemeName
  readonly workspaceName: string
}) {
  const themeLabel = theme === "night" ? "切换到拂晓" : "切换到夜间"
  return (
    <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`} data-app-background>
      <div className="brand">
        <span className="brand-mark">
          <BrandMark size={22} />
        </span>
        <div className="brand__copy">
          <strong>银河居所</strong>
          <span>{workspaceName}</span>
        </div>
      </div>
      <p className="sidebar-clock">{clockLabel}</p>
      <nav aria-label="主导航">
        {NAV_ITEMS.map(({ end, icon: Icon, label, to }) => (
          <NavLink
            aria-label={label}
            className={({ isActive, isPending }) =>
              `nav-item${isActive ? " nav-item--active" : ""}${isPending ? " nav-item--pending" : ""}`
            }
            end={end}
            key={to}
            title={label}
            to={to}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__bottom">
        <button
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
          className="nav-item"
          onClick={onToggleCollapsed}
          title={collapsed ? "展开侧栏" : "折叠侧栏"}
          type="button"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" size={18} />
          ) : (
            <PanelLeftClose aria-hidden="true" size={18} />
          )}
          <span>{collapsed ? "展开侧栏" : "折叠侧栏"}</span>
        </button>
        <button aria-label="全局搜索" className="nav-item" onClick={onOpenSearch} type="button">
          <Search aria-hidden="true" size={18} />
          <span>全局搜索</span>
          <kbd>⌘K</kbd>
        </button>
        <button
          aria-label={themeLabel}
          className="nav-item"
          onClick={onToggleTheme}
          title={themeLabel}
          type="button"
        >
          {theme === "night" ? (
            <Sun aria-hidden="true" size={18} />
          ) : (
            <Moon aria-hidden="true" size={18} />
          )}
          <span>{theme === "night" ? "拂晓外观" : "夜间外观"}</span>
        </button>
        <NavLink
          aria-label="设置"
          className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
          title="设置"
          to="/settings"
        >
          <Settings aria-hidden="true" size={18} />
          <span>设置</span>
        </NavLink>
      </div>
    </aside>
  )
}
