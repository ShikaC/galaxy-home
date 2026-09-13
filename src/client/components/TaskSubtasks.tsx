import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Pencil, Plus } from "lucide-react"
import { useState } from "react"
import type { Item } from "../../shared/items.js"
import { itemDetailSchema, itemSchema } from "../../shared/items.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { invalidateTaskQueries } from "../lib/mutations.js"
import { Button } from "./ui/Button.js"
import { TextField } from "./ui/Field.js"

function SubtaskRow({
  item,
  onParentVersionBump,
}: {
  readonly item: Item
  readonly onParentVersionBump: () => void
}) {
  const client = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const save = useMutation({
    mutationFn: (status?: Item["status"]) =>
      apiRequest(`/api/items/${item.id}`, itemSchema, {
        method: "PATCH",
        body: jsonBody({ expectedVersion: item.version, title, ...(status ? { status } : {}) }),
      }),
    onSuccess: async () => {
      onParentVersionBump()
      setEditing(false)
      await invalidateTaskQueries(client)
    },
  })
  return (
    <li className="subtask-row">
      <button
        aria-label={item.status === "completed" ? `重新打开 ${item.title}` : `完成 ${item.title}`}
        className="task-check task-check--small"
        disabled={save.isPending}
        onClick={() => save.mutate(item.status === "completed" ? "active" : "completed")}
        type="button"
      >
        {item.status === "completed" ? <Check size={13} /> : null}
      </button>
      {editing ? (
        <TextField
          aria-label={`编辑 ${item.title}`}
          label="子任务标题"
          maxLength={240}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      ) : (
        <span
          className={`subtask-row__title ${item.status === "completed" ? "subtask-row__completed" : ""}`.trim()}
        >
          {item.title}
        </span>
      )}
      <div className="button-row">
        {editing ? (
          <>
            <Button onClick={() => setEditing(false)} size="compact" variant="ghost">
              取消
            </Button>
            <Button
              disabled={!title.trim()}
              loading={save.isPending}
              onClick={() => save.mutate(undefined)}
              size="compact"
            >
              保存子任务
            </Button>
          </>
        ) : (
          <Button
            aria-label={`编辑 ${item.title}`}
            onClick={() => setEditing(true)}
            size="compact"
            variant="ghost"
          >
            <Pencil size={13} />
            编辑
          </Button>
        )}
      </div>
      {save.isError ? (
        <p className="inline-error" role="alert">
          {save.error.message}
        </p>
      ) : null}
    </li>
  )
}

export function TaskSubtasks({
  item,
  onParentVersionBump,
}: {
  readonly item: Item
  readonly onParentVersionBump: () => void
}) {
  const client = useQueryClient()
  const [title, setTitle] = useState("")
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const detail = useQuery({
    queryKey: ["item-detail", item.id],
    queryFn: () => apiRequest(`/api/items/${item.id}`, itemDetailSchema),
  })
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/items", itemSchema, {
        method: "POST",
        body: jsonBody({
          requestId,
          title,
          parentId: item.id,
          categoryIds: [],
          projectIds: [],
        }),
      }),
    onSuccess: async () => {
      onParentVersionBump()
      setTitle("")
      setRequestId(crypto.randomUUID())
      await invalidateTaskQueries(client)
    },
  })
  return (
    <section className="subtasks" aria-labelledby="subtasks-title">
      <header>
        <h3 id="subtasks-title">子任务</h3>
        <span>
          {item.completedSubtaskCount}/{item.subtaskCount}
        </span>
      </header>
      {detail.data?.subtasks.length ? (
        <ul>
          {detail.data.subtasks.map((subtask) => (
            <SubtaskRow item={subtask} key={subtask.id} onParentVersionBump={onParentVersionBump} />
          ))}
        </ul>
      ) : (
        <p className="setting-note">还没有子任务。</p>
      )}
      <div className="subtask-create">
        <TextField
          label="新子任务标题"
          maxLength={240}
          onChange={(event) => {
            if (create.isError) setRequestId(crypto.randomUUID())
            setTitle(event.target.value)
          }}
          value={title}
        />
        <Button
          disabled={!title.trim()}
          loading={create.isPending}
          onClick={() => create.mutate()}
          size="compact"
        >
          <Plus size={14} />
          添加子任务
        </Button>
      </div>
      <p className="setting-note">添加与保存子任务会立即生效，不随上方编辑的取消而撤销。</p>
      {detail.isError || create.isError ? (
        <p className="inline-error" role="alert">
          {detail.error?.message ?? create.error?.message}
        </p>
      ) : null}
    </section>
  )
}
