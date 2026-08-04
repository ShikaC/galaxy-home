import { useQuery } from "@tanstack/react-query"
import { Search, X } from "lucide-react"
import { useState } from "react"
import { apiRequest } from "../lib/api.js"
import { searchResultsSchema } from "../lib/schemas.js"
import { EmptyState } from "./ui/EmptyState.js"
import { IconButton } from "./ui/IconButton.js"

const TYPE_LABELS = {
  item: "待办",
  category: "分类",
  project: "项目",
  habit: "习惯",
  gain: "收获",
  review: "回顾",
  conversation: "AI 会话",
} as const

export function SearchDialog({
  onClose,
  open,
}: {
  readonly onClose: () => void
  readonly open: boolean
}) {
  const [query, setQuery] = useState("")
  const results = useQuery({
    queryKey: ["search", query],
    queryFn: () => apiRequest(`/api/search?q=${encodeURIComponent(query)}`, searchResultsSchema),
    enabled: query.trim().length > 0,
  })
  if (!open) return null
  return (
    <div className="overlay">
      <section
        aria-label="全局搜索"
        aria-modal="true"
        className="dialog search-dialog"
        role="dialog"
      >
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
        <div className="search-results">
          {query.trim() === "" ? (
            <EmptyState
              description="输入关键词，结果会覆盖整个个人空间。"
              icon={Search}
              title="查找任何内容"
            />
          ) : results.data?.length === 0 ? (
            <EmptyState
              description="换一个更短的关键词再试试。"
              icon={Search}
              title="没有匹配结果"
            />
          ) : (
            results.data?.map((result) => (
              <article className="search-result" key={`${result.type}-${result.id}`}>
                <div>
                  <span className="badge">{TYPE_LABELS[result.type]}</span>
                  <strong>{result.title}</strong>
                </div>
                {result.detail ? <p>{result.detail}</p> : null}
                <time>{result.date}</time>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
