import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Search, Sparkles, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { z } from "zod"
import { assertNever } from "../../shared/assertNever.js"
import { apiRequest } from "../lib/api.js"
import { matchingCommands, type PaletteCommand } from "../lib/commandPalette.js"
import { searchResultsSchema } from "../lib/schemas.js"
import { useAppActions, useAppAppearance } from "./AppContext.js"
import { EmptyState } from "./ui/EmptyState.js"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"

const TYPE_LABELS = {
  item: "待办",
  category: "分类",
  project: "项目",
  habit: "习惯",
  gain: "收获",
  review: "回顾",
  conversation: "AI 会话",
} as const
type SearchType = keyof typeof TYPE_LABELS
const searchTypeSchema = z.enum([
  "item",
  "category",
  "project",
  "habit",
  "gain",
  "review",
  "conversation",
  "",
])

function resultPath(type: SearchType, id: string): string {
  switch (type) {
    case "project":
      return `/projects/${id}`
    case "category":
      return `/todos?category=${id}`
    case "habit":
      return "/habits"
    case "gain":
    case "review":
      return "/review"
    case "item":
      return "/todos"
    case "conversation":
      return "/"
    default:
      return assertNever(type)
  }
}

export function SearchDialog({
  onClose,
  open,
}: {
  readonly onClose: () => void
  readonly open: boolean
}) {
  const navigate = useNavigate()
  const actions = useAppActions()
  const appearance = useAppAppearance()
  const [query, setQuery] = useState("")
  const [type, setType] = useState<SearchType | "">("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const commands = useMemo(() => matchingCommands(query), [query])
  const results = useQuery({
    queryKey: ["search", query, type, dateFrom, dateTo],
    queryFn: () => {
      const parameters = new URLSearchParams({ q: query })
      if (type !== "") parameters.set("type", type)
      if (dateFrom !== "") parameters.set("dateFrom", dateFrom)
      if (dateTo !== "") parameters.set("dateTo", dateTo)
      return apiRequest(`/api/search?${parameters.toString()}`, searchResultsSchema)
    },
    enabled: query.trim().length > 0,
  })
  const searchHits = results.data ?? []
  const rowCount = commands.length + searchHits.length
  const runCommand = (command: PaletteCommand) => {
    switch (command.kind) {
      case "capture":
        onClose()
        actions.openCapture()
        return
      case "navigate":
        onClose()
        navigate(command.path)
        return
      case "ai":
        onClose()
        actions.openAi()
        return
      case "theme":
        appearance.toggleTheme()
        return
      default:
        assertNever(command)
    }
  }
  if (!open) return null
  return (
    <DialogSurface ariaLabel="全局搜索" className="dialog search-dialog" onClose={onClose}>
      <header className="search-box">
        <Search aria-hidden="true" size={18} />
        <input
          aria-label="搜索空间"
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setActiveIndex((current) => (rowCount === 0 ? 0 : (current + 1) % rowCount))
              return
            }
            if (event.key === "ArrowUp") {
              event.preventDefault()
              setActiveIndex((current) =>
                rowCount === 0 ? 0 : (current - 1 + rowCount) % rowCount,
              )
              return
            }
            if (event.key !== "Enter" || rowCount === 0) return
            event.preventDefault()
            if (activeIndex < commands.length) {
              const command = commands[activeIndex]
              if (command) runCommand(command)
              return
            }
            const hit = searchHits[activeIndex - commands.length]
            if (!hit) return
            onClose()
            if (hit.type === "conversation") actions.openAi({ conversationId: hit.id })
            else navigate(resultPath(hit.type, hit.id))
          }}
          placeholder="搜索，或输入指令…"
          value={query}
        />
        <kbd>ESC</kbd>
        <IconButton label="关闭搜索" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="search-filters">
        <label>
          <span>类型</span>
          <select
            onChange={(event) => setType(searchTypeSchema.parse(event.target.value))}
            value={type}
          >
            <option value="">全部</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>从</span>
          <input
            onChange={(event) => setDateFrom(event.target.value)}
            type="date"
            value={dateFrom}
          />
        </label>
        <label>
          <span>至</span>
          <input
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
            type="date"
            value={dateTo}
          />
        </label>
      </div>
      <div className="search-results">
        {commands.length > 0 ? (
          <p className="search-group">指令</p>
        ) : query.trim() === "" ? (
          <EmptyState
            description="输入关键词，或用方向键选择一条指令。"
            icon={Sparkles}
            title="查找任何内容"
          />
        ) : null}
        {commands.map((command, index) => (
          <button
            className={`search-result${index === activeIndex ? " search-result--active" : ""}`}
            key={command.id}
            onClick={() => runCommand(command)}
            type="button"
          >
            <div>
              <span className="badge">指令</span>
              <strong>{command.label}</strong>
            </div>
            <time>{command.hint}</time>
          </button>
        ))}
        {query.trim() !== "" ? <p className="search-group">空间里的内容</p> : null}
        {query.trim() !== "" && searchHits.length === 0 && !results.isFetching ? (
          <EmptyState description="换一个更短的关键词再试试。" icon={Search} title="没有匹配结果" />
        ) : null}
        {searchHits.map((result, index) => {
          const rowIndex = commands.length + index
          return (
            <button
              className={`search-result${rowIndex === activeIndex ? " search-result--active" : ""}`}
              key={`${result.type}-${result.id}`}
              onClick={() => {
                onClose()
                if (result.type === "conversation") actions.openAi({ conversationId: result.id })
                else navigate(resultPath(result.type, result.id))
              }}
              type="button"
            >
              <div>
                <span className="badge">{TYPE_LABELS[result.type]}</span>
                <strong>{result.title}</strong>
              </div>
              {result.detail ? <p>{result.detail}</p> : null}
              <time>{result.date}</time>
              <ArrowRight aria-hidden="true" className="search-result__go" size={14} />
            </button>
          )
        })}
      </div>
    </DialogSurface>
  )
}
