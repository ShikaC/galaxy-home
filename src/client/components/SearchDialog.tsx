import { useQuery } from "@tanstack/react-query"
import { Search, X } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import { z } from "zod"
import { apiRequest } from "../lib/api.js"
import { searchResultsSchema } from "../lib/schemas.js"
import { useAppActions } from "./AppContext.js"
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
  if (type === "project") return `/projects/${id}`
  if (type === "category") return `/todos?category=${id}`
  if (type === "habit") return "/habits"
  if (type === "gain" || type === "review") return "/review"
  return "/todos"
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
  const [query, setQuery] = useState("")
  const [type, setType] = useState<SearchType | "">("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
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
  if (!open) return null
  return (
    <DialogSurface ariaLabel="全局搜索" className="dialog search-dialog" onClose={onClose}>
      <header className="search-box">
        <Search aria-hidden="true" size={19} />
        <input
          aria-label="搜索空间"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索待办、项目、习惯、回顾或会话"
          value={query}
        />
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
        {query.trim() === "" ? (
          <EmptyState
            description="输入关键词，结果会覆盖整个个人空间。"
            icon={Search}
            title="查找任何内容"
          />
        ) : results.data?.length === 0 ? (
          <EmptyState description="换一个更短的关键词再试试。" icon={Search} title="没有匹配结果" />
        ) : (
          results.data?.map((result) => (
            <button
              className="search-result"
              key={`${result.type}-${result.id}`}
              onClick={() => {
                onClose()
                if (result.type === "conversation") actions.openAi(result.id)
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
            </button>
          ))
        )}
      </div>
    </DialogSurface>
  )
}
