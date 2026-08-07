import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Sparkles, X } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import type { Item } from "../../shared/items.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { instantForLocalDateTimeInput, localDateTimeInputFor } from "../lib/date.js"
import { useMeta, useProjects } from "../lib/queries.js"
import { itemSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"
import { TextArea, TextField } from "./ui/Field.js"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"

export function OrganizeDialog({
  item,
  mode = "organize",
  onClose,
}: {
  readonly item: Item | null
  readonly mode?: "organize" | "edit"
  readonly onClose: () => void
}) {
  const meta = useMeta()
  const projects = useProjects()
  const client = useQueryClient()
  const timezone = meta.data?.settings.timezone ?? "UTC"
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [reminder, setReminder] = useState("")
  const [categories, setCategories] = useState<readonly string[]>([])
  const [projectIds, setProjectIds] = useState<readonly string[]>([])
  const [suggestNote, setSuggestNote] = useState<string | null>(null)
  useEffect(() => {
    if (item === null) return
    setTitle(item.title)
    setNotes(item.notes ?? "")
    setDueAt(item.dueAt === null ? "" : localDateTimeInputFor(item.dueAt, timezone))
    setReminder(item.reminderMinutes?.toString() ?? "")
    setCategories(item.categoryIds)
    setProjectIds(item.projectIds)
    setSuggestNote(null)
    void apiRequest(
      `/api/items/${item.id}/ai-suggestion`,
      z.object({
        status: z.enum(["waiting", "ready", "failed", "none"]).optional(),
        categoryIds: z.array(z.string().uuid()).optional(),
        suggestToday: z.boolean().optional(),
        note: z.string().nullable().optional(),
      }),
    )
      .then((data) => {
        if (data.status === "waiting") setSuggestNote("AI 正在分析这条随手记…")
        else if (data.status === "ready" && data.categoryIds !== undefined) {
          setCategories(data.categoryIds)
          setSuggestNote(
            data.note ??
              (data.suggestToday
                ? "已预填捕获分析建议；可修改后保存。建议也考虑加入今日。"
                : "已预填捕获分析建议；可修改后保存。"),
          )
        } else if (data.status === "failed") setSuggestNote(data.note ?? "上次分析未完成")
      })
      .catch(() => undefined)
  }, [item, timezone])
  const suggest = useMutation({
    mutationFn: () =>
      apiRequest(
        "/api/ai/suggest-categories",
        z.object({
          categoryIds: z.array(z.string().uuid()),
          suggestToday: z.boolean(),
          note: z.string().nullable(),
        }),
        { method: "POST", body: jsonBody({ itemId: item?.id }) },
      ),
    onSuccess: (data) => {
      setCategories(data.categoryIds)
      setSuggestNote(
        data.note ??
          (data.suggestToday ? "建议也考虑加入今日（需在首页自行添加）。" : "已填入建议分类，保存后生效。"),
      )
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      if (item === null) return
      const dueAtInstant = instantForLocalDateTimeInput(dueAt, timezone)
      await apiRequest(`/api/items/${item.id}`, itemSchema, {
        method: "PATCH",
        body: jsonBody({
          title,
          notes: notes || null,
          dueAt: dueAtInstant,
          reminderMinutes: dueAt && reminder ? Number(reminder) : null,
        }),
      })
      await Promise.all([
        apiVoid(`/api/items/${item.id}/categories`, {
          method: "PUT",
          body: jsonBody({ categoryIds: categories }),
        }),
        apiVoid(`/api/items/${item.id}/projects`, {
          method: "PUT",
          body: jsonBody({ projectIds }),
        }),
      ])
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["items"] })
      onClose()
    },
  })
  if (item === null) return null
  const toggle = (values: readonly string[], value: string) =>
    values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
  return (
    <DialogSurface ariaLabelledBy="organize-title" onClose={onClose}>
      <header className="dialog__header">
        <div>
          <p className="eyebrow">{mode === "edit" ? "编辑待办" : "整理条目"}</p>
          <h2 id="organize-title">
            {mode === "edit" ? "把内容改成现在准确的样子" : "决定它接下来去哪里"}
          </h2>
        </div>
        <IconButton label={mode === "edit" ? "关闭编辑面板" : "关闭整理面板"} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <TextField label="标题" onChange={(event) => setTitle(event.target.value)} value={title} />
        <TextArea
          label="备注"
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          value={notes}
        />
        <div className="form-grid">
          <TextField
            label="截止时间"
            onChange={(event) => setDueAt(event.target.value)}
            type="datetime-local"
            value={dueAt}
          />
          <label className="field">
            <span className="field__label">提醒</span>
            <select
              className="field__control"
              disabled={!dueAt}
              onChange={(event) => setReminder(event.target.value)}
              value={reminder}
            >
              <option value="">不提醒</option>
              <option value="0">截止时</option>
              <option value="30">提前 30 分钟</option>
              <option value="1440">提前 1 天</option>
            </select>
          </label>
        </div>
        <fieldset className="choice-group">
          <legend>分类（可多选）</legend>
          {meta.data?.ai.configured ? (
            <div className="button-row">
              <Button
                disabled={(meta.data?.categories.length ?? 0) === 0}
                loading={suggest.isPending}
                onClick={() => suggest.mutate()}
                size="compact"
                type="button"
                variant="secondary"
              >
                <Sparkles size={14} />
                请 AI 建议分类
              </Button>
            </div>
          ) : null}
          {suggestNote === null ? null : <p className="setting-note">{suggestNote}</p>}
          {suggest.isError ? <p className="inline-error">{suggest.error.message}</p> : null}
          {meta.data?.categories.length === 0 ? (
            <p>还没有分类，可在待办页侧栏或设置中创建。</p>
          ) : (
            meta.data?.categories.map((category) => (
              <label key={category.id}>
                <input
                  checked={categories.includes(category.id)}
                  onChange={() => setCategories(toggle(categories, category.id))}
                  type="checkbox"
                />
                <span className="color-swatch" style={{ background: category.color }} />
                {category.name}
              </label>
            ))
          )}
        </fieldset>
        <fieldset className="choice-group">
          <legend>关联项目（可多选）</legend>
          {projects.data?.map((project) => (
            <label key={project.id}>
              <input
                checked={projectIds.includes(project.id)}
                onChange={() => setProjectIds(toggle(projectIds, project.id))}
                type="checkbox"
              />
              {project.name}
            </label>
          ))}
        </fieldset>
        {save.isError ? <p className="inline-error">{save.error.message}</p> : null}
        <footer className="dialog__actions">
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button disabled={!title.trim()} loading={save.isPending} type="submit">
            {mode === "edit" ? "保存修改" : "保存整理"}
          </Button>
        </footer>
      </form>
    </DialogSurface>
  )
}
