import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Inbox, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import type { Item } from "../../shared/items.js"
import { useAppActions, useAppTime } from "../components/AppContext.js"
import { CategoryDialog } from "../components/CategoryDialog.js"
import { OrganizeDialog } from "../components/OrganizeDialog.js"
import { PageHeader } from "../components/PageHeader.js"
import { SortableItemList } from "../components/SortableItemList.js"
import { TaskRow } from "../components/TaskRow.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { Toast } from "../components/ui/Feedback.js"
import { IconButton } from "../components/ui/IconButton.js"
import { apiRequest, apiVoid } from "../lib/api.js"
import { useItemStatusMutation, useTodayMutation } from "../lib/mutations.js"
import { useMeta } from "../lib/queries.js"
import { itemSchema, itemsSchema, projectSchema } from "../lib/schemas.js"

type View = "active" | "inbox" | "completed" | "archived"
type StatusNotice = Readonly<{
  readonly message: string
  readonly showCompletedLink: boolean
}>
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
  const navigate = useNavigate()
  const [searchParameters] = useSearchParams()
  const [view, setView] = useState<View>("inbox")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [organizing, setOrganizing] = useState<Item | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [organizeNote, setOrganizeNote] = useState<string | null>(null)
  const [statusNotice, setStatusNotice] = useState<StatusNotice | null>(null)
  useEffect(() => {
    const requested = searchParameters.get("category")
    if (requested === null) {
      setCategoryId(null)
      const requestedView = searchParameters.get("view")
      const requestedViewOption = VIEWS.find((option) => option.id === requestedView)
      setView(requestedViewOption?.id ?? "inbox")
      return
    }
    if (meta.data?.categories.some((category) => category.id === requested)) {
      setCategoryId(requested)
      setView("active")
    }
  }, [meta.data?.categories, searchParameters])
  useEffect(() => {
    if (organizeNote === null) return
    const timer = window.setTimeout(() => setOrganizeNote(null), 4_000)
    return () => window.clearTimeout(timer)
  }, [organizeNote])
  useEffect(() => {
    if (statusNotice === null) return
    const timer = window.setTimeout(() => setStatusNotice(null), 4_000)
    return () => window.clearTimeout(timer)
  }, [statusNotice])
  const status = useItemStatusMutation((item, change) => {
    if (change.status === "archived") return
    const completed = change.status === "completed"
    setStatusNotice({
      message: completed
        ? `“${item.title}”已完成，可在“已完成”中找回。`
        : `“${item.title}”已重新打开。`,
      showCompletedLink: completed,
    })
  })
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
  const copy = useMutation({
    mutationFn: (item: Item) =>
      apiRequest(`/api/items/${item.id}/copy`, itemSchema, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["items"] }),
  })
  const convert = useMutation({
    mutationFn: (item: Item) =>
      apiRequest(`/api/items/${item.id}/convert-to-project`, projectSchema, { method: "POST" }),
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ["items"] })
      void client.invalidateQueries({ queryKey: ["projects"] })
      void navigate(`/projects/${project.id}`)
    },
  })
  const renderItem = (item: Item) => (
    <TaskRow
      item={item}
      onArchive={
        item.status === "active"
          ? () => status.mutate({ id: item.id, status: "archived" })
          : undefined
      }
      onComplete={() => {
        status.mutate({
          id: item.id,
          status: item.status === "completed" ? "active" : "completed",
        })
      }}
      onConvertProject={item.status === "active" ? () => convert.mutate(item) : undefined}
      onCopy={() => copy.mutate(item)}
      onDelete={() => remove.mutate(item)}
      onEdit={() => setEditing(item)}
      onFocus={
        item.status === "active" ? () => today.mutate({ id: item.id, focus: true }) : undefined
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
  )
  const reorderCategory = (itemIds: readonly string[]) => {
    if (categoryId === null) return
    void apiVoid(`/api/categories/${categoryId}/items/reorder`, {
      method: "PUT",
      body: JSON.stringify({ itemIds }),
    }).then(() => client.invalidateQueries({ queryKey: ["items"] }))
  }
  const selectView = (next: View) => {
    setView(next)
    setCategoryId(null)
    if (searchParameters.get("category") !== null) {
      void navigate(next === "inbox" ? "/todos" : `/todos?view=${next}`)
    }
  }
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
      {organizeNote === null ? null : <Toast>{organizeNote}</Toast>}
      {statusNotice === null ? null : (
        <Toast>
          <span>{statusNotice.message}</span>
          {statusNotice.showCompletedLink ? (
            <Link className="text-action" to="/todos?view=completed">
              查看已完成
            </Link>
          ) : null}
        </Toast>
      )}
      <div className="todo-layout">
        <aside className="filter-nav">
          <strong>视图</strong>
          {VIEWS.map((option) => (
            <button
              className={view === option.id && categoryId === null ? "selected" : ""}
              key={option.id}
              onClick={() => selectView(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
          <div className="filter-nav__heading">
            <strong>分类</strong>
            <IconButton label="新建分类" onClick={() => setCreateCategoryOpen(true)}>
              <Plus size={15} />
            </IconButton>
          </div>
          {(meta.data?.categories.length ?? 0) === 0 ? (
            <p className="filter-nav__hint">还没有分类，点加号创建。</p>
          ) : (
            meta.data?.categories.map((category) => (
              <button
                className={categoryId === category.id ? "selected" : ""}
                key={category.id}
                onClick={() => {
                  setCategoryId(category.id)
                  setView("active")
                  void navigate(`/todos?category=${category.id}`)
                }}
                type="button"
              >
                <span className="color-swatch" style={{ background: category.color }} />
                {category.name}
              </button>
            ))
          )}
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
                view === "inbox" && categoryId === null ? (
                  <Button onClick={() => selectView("active")} size="compact" variant="secondary">
                    查看全部活跃
                  </Button>
                ) : (
                  <Button onClick={actions.openCapture} size="compact">
                    写下一件事
                  </Button>
                )
              }
              description={
                view === "inbox" && categoryId === null
                  ? "已分类或关联项目的条目会离开收集箱，可在「全部活跃」中找到。"
                  : "这里目前没有条目。"
              }
              icon={Inbox}
              title={view === "inbox" && categoryId === null ? "收集箱是空的" : "一切都已安放"}
            />
          ) : categoryId === null ? (
            <div className="list-stack">
              {items.data?.map((item) => (
                <div key={item.id}>{renderItem(item)}</div>
              ))}
            </div>
          ) : (
            <SortableItemList
              items={items.data ?? []}
              onReorder={reorderCategory}
              renderItem={renderItem}
            />
          )}
          {copy.isError || convert.isError ? (
            <p className="inline-error">{copy.error?.message ?? convert.error?.message}</p>
          ) : null}
        </section>
      </div>
      <CategoryDialog
        onClose={() => setCreateCategoryOpen(false)}
        onCreated={(id) => {
          setCategoryId(id)
          setView("active")
          void navigate(`/todos?category=${id}`)
        }}
        open={createCategoryOpen}
      />
      <OrganizeDialog
        item={editing ?? organizing}
        mode={editing === null ? "organize" : "edit"}
        onClose={() => {
          setEditing(null)
          setOrganizing(null)
        }}
        onSaved={(item, detail) => {
          if (detail.leftInbox && view === "inbox") {
            setOrganizeNote(`「${item.title}」已整理，可在「全部活跃」中找到。`)
          }
        }}
      />
    </div>
  )
}
