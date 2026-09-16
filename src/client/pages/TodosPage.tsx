import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Inbox, Plus, Repeat2, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { z } from "zod"
import type { Item } from "../../shared/items.js"
import { useAppActions, useAppTime } from "../components/AppContext.js"
import { CategoryDialog } from "../components/CategoryDialog.js"
import { OrganizeDialog } from "../components/OrganizeDialog.js"
import { PageHeader } from "../components/PageHeader.js"
import { SortableItemList } from "../components/SortableItemList.js"
import { TaskRow } from "../components/TaskRow.js"
import { TaskSeriesDialog } from "../components/TaskSeriesDialog.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { Toast } from "../components/ui/Feedback.js"
import { IconButton } from "../components/ui/IconButton.js"
import { QueryFeedback } from "../components/ui/QueryFeedback.js"
import { apiRequest, apiVoid } from "../lib/api.js"
import { invalidateTaskQueries, useItemStatusMutation, useTodayMutation } from "../lib/mutations.js"
import { useMeta } from "../lib/queries.js"
import { itemSchema, itemsSchema, projectSchema } from "../lib/schemas.js"

type View = "today" | "active" | "inbox" | "completed" | "archived"
type StatusNotice = Readonly<{
  readonly message: string
  readonly showCompletedLink: boolean
}>
const VIEWS: readonly { readonly id: View; readonly label: string }[] = [
  { id: "inbox", label: "收集箱" },
  { id: "today", label: "今日计划" },
  { id: "active", label: "全部活跃" },
  { id: "completed", label: "已完成" },
  { id: "archived", label: "已归档" },
]
const priorityFilterSchema = z.enum(["all", "none", "low", "medium", "high"])

export function TodosPage() {
  const actions = useAppActions()
  const { today: localToday } = useAppTime()
  const meta = useMeta()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [searchParameters, setSearchParameters] = useSearchParams()
  // URL 是当前视图的唯一真相源，避免导航与本地状态互相追赶。
  const requestedCategory = searchParameters.get("category")
  const categoryId =
    requestedCategory !== null &&
    (meta.data?.categories.some((category) => category.id === requestedCategory) ?? false)
      ? requestedCategory
      : null
  const view: View =
    categoryId !== null
      ? "active"
      : (VIEWS.find((option) => option.id === searchParameters.get("view"))?.id ?? "inbox")
  // 筛选状态也一律走 URL：刷新不丢、链接可分享，且所有切换都保留其它参数。
  const priority: Item["priority"] | "all" =
    priorityFilterSchema.safeParse(searchParameters.get("priority")).data ?? "all"
  const updateParameters = (
    patch: Record<string, string | null>,
    options?: { replace?: boolean },
  ) => {
    setSearchParameters((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      return next
    }, options)
  }
  const [organizing, setOrganizing] = useState<Item | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [organizeNote, setOrganizeNote] = useState<string | null>(null)
  const [statusNotice, setStatusNotice] = useState<StatusNotice | null>(null)
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
  const skip = useMutation({
    mutationFn: (item: Item) =>
      apiRequest(`/api/items/${item.id}/skip`, itemSchema, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: item.version }),
      }),
    onSuccess: () => invalidateTaskQueries(client),
  })
  const renderItem = (item: Item) => (
    <TaskRow
      item={item}
      onArchive={
        item.status === "active"
          ? () => status.mutate({ id: item.id, expectedVersion: item.version, status: "archived" })
          : undefined
      }
      onComplete={() => {
        status.mutate({
          id: item.id,
          expectedVersion: item.version,
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
      onManageSeries={
        item.recurrenceSeriesId
          ? () => {
              setSeriesId(item.recurrenceSeriesId)
              setSeriesOpen(true)
            }
          : undefined
      }
      onOrganize={item.status === "active" ? () => setOrganizing(item) : undefined}
      onSecondary={
        item.status === "active" && !item.inToday
          ? () => today.mutate({ id: item.id, focus: false, secondary: true })
          : undefined
      }
      onSkip={
        item.recurrenceSeriesId && item.status === "active" ? () => skip.mutate(item) : undefined
      }
      onToday={
        item.status === "active" && !item.inToday
          ? () => today.mutate({ id: item.id, focus: false })
          : undefined
      }
    />
  )
  const visibleItems = (items.data ?? [])
    .filter((item) => priority === "all" || item.priority === priority)
    .toSorted((left, right) => {
      const rank = { none: 0, low: 1, medium: 2, high: 3 } as const
      return rank[right.priority] - rank[left.priority]
    })
  const reorderCategory = (itemIds: readonly string[]) => {
    if (categoryId === null) return
    void apiVoid(`/api/categories/${categoryId}/items/reorder`, {
      method: "PUT",
      body: JSON.stringify({ itemIds }),
    }).then(() => client.invalidateQueries({ queryKey: ["items"] }))
  }
  const selectView = (next: View) => {
    updateParameters({ view: next === "inbox" ? null : next, category: null })
  }
  return (
    <div className="page">
      <PageHeader
        actions={
          <div className="button-row">
            <Button
              onClick={() => {
                setSeriesId(null)
                setSeriesOpen(true)
              }}
              variant="secondary"
            >
              <Repeat2 size={16} />
              创建重复任务
            </Button>
            <Button onClick={actions.openCapture}>
              <Plus size={16} />
              随手记
            </Button>
          </div>
        }
        subtitle="先捕捉，再整理；想法会慢慢找到归处。"
        title="待办"
      />
      {organizeNote === null ? null : <Toast>{organizeNote}</Toast>}
      {status.isError || skip.isError ? (
        <Toast tone="error">{status.error?.message ?? skip.error?.message}</Toast>
      ) : null}
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
                onClick={() => updateParameters({ category: category.id, view: null })}
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
            <div className="task-list-tools">
              <label>
                <span>优先级</span>
                <select
                  aria-label="按优先级筛选"
                  value={priority}
                  onChange={(event) => {
                    const next = priorityFilterSchema.parse(event.target.value)
                    updateParameters({ priority: next === "all" ? null : next }, { replace: true })
                  }}
                >
                  <option value="all">全部</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                  <option value="none">无</option>
                </select>
              </label>
              <span>{items.data === undefined ? "—" : `${visibleItems.length} 项`}</span>
              <Link className="text-action" to="/task-plans?mode=capture">
                <Sparkles size={13} />
                AI 拆分录入
              </Link>
            </div>
          </header>
          {items.isError || items.isPending ? (
            <QueryFeedback
              error={items.error}
              pending={items.isPending}
              retry={() => void items.refetch()}
            />
          ) : visibleItems.length === 0 ? (
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
              {visibleItems.map((item) => (
                <div key={item.id}>{renderItem(item)}</div>
              ))}
            </div>
          ) : (
            <SortableItemList
              items={visibleItems}
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
        onCreated={(id) => updateParameters({ category: id, view: null })}
        open={createCategoryOpen}
      />
      <OrganizeDialog
        item={editing ?? organizing}
        mode={editing === null ? "organize" : "edit"}
        onClose={() => {
          setEditing(null)
          setOrganizing(null)
        }}
        onEditSeries={(id) => {
          setEditing(null)
          setOrganizing(null)
          setSeriesId(id)
          setSeriesOpen(true)
        }}
        onSaved={(item, detail) => {
          if (detail.leftInbox && view === "inbox") {
            setOrganizeNote(`「${item.title}」已整理，可在「全部活跃」中找到。`)
          }
        }}
      />
      <TaskSeriesDialog
        onClose={() => {
          setSeriesOpen(false)
          setSeriesId(null)
        }}
        open={seriesOpen}
        seriesId={seriesId}
      />
    </div>
  )
}
