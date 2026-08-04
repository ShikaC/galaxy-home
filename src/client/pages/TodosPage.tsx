import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Inbox, Plus } from "lucide-react"
import { useState } from "react"
import type { Item } from "../../shared/items.js"
import { useAppActions, useAppTime } from "../components/AppContext.js"
import { OrganizeDialog } from "../components/OrganizeDialog.js"
import { PageHeader } from "../components/PageHeader.js"
import { TaskRow } from "../components/TaskRow.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { apiRequest, apiVoid } from "../lib/api.js"
import { useItemStatusMutation, useTodayMutation } from "../lib/mutations.js"
import { useMeta } from "../lib/queries.js"
import { itemsSchema } from "../lib/schemas.js"

type View = "active" | "inbox" | "completed" | "archived"
const VIEWS: readonly { readonly id: View; readonly label: string }[] = [
  { id: "inbox", label: "收集箱" },
  { id: "active", label: "全部活跃" },
  { id: "completed", label: "已完成" },
  { id: "archived", label: "已归档" },
]

export function TodosPage() {
  const actions = useAppActions()
  const { today: localToday } = useAppTime()
  const meta = useMeta()
  const client = useQueryClient()
  const [view, setView] = useState<View>("inbox")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [organizing, setOrganizing] = useState<Item | null>(null)
  const status = useItemStatusMutation()
  const today = useTodayMutation()
  const items = useQuery({
    queryKey: ["items", view, categoryId, localToday],
    queryFn: () =>
      apiRequest(
        `/api/items?view=${view}&localDate=${localToday}${categoryId === null ? "" : `&categoryId=${categoryId}`}`,
        itemsSchema,
      ),
  })
  const remove = useMutation({
    mutationFn: (item: Item) => apiVoid(`/api/items/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["items"] })
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  return (
    <div className="page">
      <PageHeader
        actions={
          <Button onClick={actions.openCapture}>
            <Plus size={16} />
            随手记
          </Button>
        }
        subtitle="先捕捉，再整理；想法会慢慢找到归处。"
        title="待办"
      />
      <div className="todo-layout">
        <aside className="filter-nav">
          <strong>视图</strong>
          {VIEWS.map((option) => (
            <button
              className={view === option.id && categoryId === null ? "selected" : ""}
              key={option.id}
              onClick={() => {
                setView(option.id)
                setCategoryId(null)
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
          <strong>分类</strong>
          {meta.data?.categories.map((category) => (
            <button
              className={categoryId === category.id ? "selected" : ""}
              key={category.id}
              onClick={() => {
                setCategoryId(category.id)
                setView("active")
              }}
              type="button"
            >
              <span className="color-swatch" style={{ background: category.color }} />
              {category.name}
            </button>
          ))}
        </aside>
        <section className="todo-list">
          <header className="list-heading">
            <h2>
              {categoryId === null
                ? VIEWS.find((entry) => entry.id === view)?.label
                : meta.data?.categories.find((entry) => entry.id === categoryId)?.name}
            </h2>
            <span>{items.data?.length ?? 0} 项</span>
          </header>
          {items.data?.length === 0 ? (
            <EmptyState
              action={
                <Button onClick={actions.openCapture} size="compact">
                  写下一件事
                </Button>
              }
              description="这里目前没有条目。"
              icon={Inbox}
              title="一切都已安放"
            />
          ) : (
            <div className="list-stack">
              {items.data?.map((item) => (
                <TaskRow
                  item={item}
                  key={item.id}
                  onArchive={
                    item.status === "active"
                      ? () => status.mutate({ id: item.id, status: "archived" })
                      : undefined
                  }
                  onComplete={() =>
                    status.mutate({
                      id: item.id,
                      status: item.status === "completed" ? "active" : "completed",
                    })
                  }
                  onDelete={() => remove.mutate(item)}
                  onFocus={
                    item.status === "active"
                      ? () => today.mutate({ id: item.id, focus: true })
                      : undefined
                  }
                  onOrganize={item.status === "active" ? () => setOrganizing(item) : undefined}
                  onSecondary={
                    item.status === "active" && !item.inToday
                      ? () => today.mutate({ id: item.id, focus: false, secondary: true })
                      : undefined
                  }
                  onToday={
                    item.status === "active" && !item.inToday
                      ? () => today.mutate({ id: item.id, focus: false })
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
      <OrganizeDialog item={organizing} onClose={() => setOrganizing(null)} />
    </div>
  )
}
