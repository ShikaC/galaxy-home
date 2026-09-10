import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  FileText,
  Lightbulb,
  Pin,
  Plus,
  Search,
  Sparkles,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useBlocker, useSearchParams } from "react-router"
import { type Note, noteSchema } from "../../shared/notes.js"
import { useAppActions } from "../components/AppContext.js"
import { PageHeader } from "../components/PageHeader.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { IconButton } from "../components/ui/IconButton.js"
import { DialogSurface } from "../components/ui/ModalSurface.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { useNotes } from "../lib/queries.js"

function NoteEditor({
  note,
  onSaved,
  onDirtyChange,
  discarding,
  creating,
}: {
  readonly note: Note
  readonly onSaved: () => Promise<void>
  readonly onDirtyChange: (dirty: boolean) => void
  readonly discarding: boolean
  readonly creating: boolean
}) {
  const actions = useAppActions()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const dirty = title !== note.title || content !== note.content
  const blocker = useBlocker(dirty && !discarding)
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  const save = useMutation({
    mutationFn: (extra: { readonly pinned?: boolean; readonly archived?: boolean }) =>
      apiRequest(`/api/notes/${note.id}`, noteSchema, {
        method: "PATCH",
        body: jsonBody({ title, content, ...extra }),
      }),
    onSuccess: async (saved) => {
      setTitle((current) => (current.trim() === saved.title ? saved.title : current))
      await onSaved()
    },
  })
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [dirty])
  const exportNote = () => {
    const url = URL.createObjectURL(
      new Blob([`# ${title}\n\n${content}\n`], { type: "text/markdown;charset=utf-8" }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `${title.replace(/[\\/:*?"<>|]/g, "-") || "note"}.md`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <article className="note-editor">
      <header className="note-editor__toolbar">
        <span className="note-save-state" role="status">
          {save.isPending ? "正在保存…" : dirty ? "有未保存的修改" : "已保存到本地"}
        </span>
        <div className="button-row">
          <IconButton
            label={note.pinned ? "取消置顶笔记" : "置顶笔记"}
            disabled={save.isPending || creating}
            onClick={() => save.mutate({ pinned: !note.pinned })}
          >
            <Pin size={16} fill={note.pinned ? "currentColor" : "none"} />
          </IconButton>
          <IconButton label="导出 Markdown" disabled={creating} onClick={exportNote}>
            <ArrowDownToLine size={16} />
          </IconButton>
          <IconButton
            label={note.archived ? "恢复笔记" : "归档笔记"}
            disabled={save.isPending || creating || !title.trim()}
            onClick={() => save.mutate({ archived: !note.archived })}
          >
            {note.archived ? <ArrowLeft size={16} /> : <Archive size={16} />}
          </IconButton>
          <Button
            size="compact"
            loading={save.isPending}
            disabled={creating || !title.trim() || !dirty}
            onClick={() => save.mutate({})}
          >
            保存笔记
          </Button>
        </div>
      </header>
      <div className="note-editor__paper">
        <span className="note-document-icon">
          <FileText size={28} strokeWidth={1.4} />
        </span>
        <input
          className="note-title-input"
          aria-label="笔记标题"
          disabled={creating}
          maxLength={240}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="给想法一个名字"
        />
        <div className="note-document-meta">
          个人笔记 <span>·</span> {new Date(note.createdAt).toLocaleDateString("zh-CN")}{" "}
          <span>·</span> {content.length.toLocaleString()} 字符
        </div>
        <textarea
          className="note-content-input"
          aria-label="笔记正文"
          disabled={creating}
          maxLength={50_000}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="从一个想法开始。记录、推敲，慢慢把它变清晰。支持以 Markdown 文本书写。"
        />
        {save.isError ? (
          <p className="inline-error" role="alert">
            {save.error.message}
          </p>
        ) : null}
        <div className="note-ai-tools">
          <Sparkles size={17} />
          <span>和 AI 一起打磨</span>
          {["提炼重点", "拓展思路", "拆成行动"].map((label) => (
            <button
              type="button"
              key={label}
              disabled={creating || !content.trim()}
              onClick={() =>
                actions.openAi({
                  draft: `请根据下面这篇笔记${label}。\n\n标题：${title}\n\n${content.slice(0, 18_000)}`,
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {blocker.state === "blocked" ? (
        <DialogSurface ariaLabel="未保存的笔记" className="dialog" onClose={() => blocker.reset()}>
          <h2>保留刚才的想法？</h2>
          <p>这篇笔记还有未保存的修改。返回保存，或放弃修改后离开。</p>
          <div className="button-row">
            <Button variant="secondary" onClick={() => blocker.proceed()}>
              放弃修改
            </Button>
            <Button onClick={() => blocker.reset()}>返回笔记</Button>
          </div>
        </DialogSurface>
      ) : null}
    </article>
  )
}

export function NotesPage() {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const archived = params.get("archived") === "true"
  const notes = useNotes(archived)
  const [query, setQuery] = useState("")
  const [dirty, setDirty] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["notes"] })
    await client.invalidateQueries({ queryKey: ["search"] })
  }
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/notes", noteSchema, {
        method: "POST",
        body: jsonBody({ title: "未命名笔记", content: "" }),
      }),
    onSuccess: async (note) => {
      await invalidate()
      setParams({ note: note.id })
    },
    onSettled: () => setDiscarding(false),
  })
  useEffect(() => {
    const first = notes.data?.[0]
    if (!params.has("note") && first)
      setParams({ note: first.id, ...(archived ? { archived: "true" } : {}) }, { replace: true })
  }, [notes.data, params, archived, setParams])
  const requestCreate = () => {
    if (dirty) setConfirmNew(true)
    else create.mutate()
  }
  const selected = notes.data?.find((note) => note.id === params.get("note"))
  const filtered =
    notes.data?.filter((note) =>
      `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? []
  return (
    <div className="page notebook-page">
      <PageHeader
        eyebrow="YOUR SECOND BRAIN"
        title="知识笔记"
        subtitle="让零散的想法，成为可以积累的知识。"
        actions={
          <Button onClick={requestCreate} loading={create.isPending}>
            <Plus size={16} />
            新建笔记
          </Button>
        }
      />
      {create.isError || notes.isError ? (
        <p className="inline-error" role="alert">
          {create.error?.message ?? notes.error?.message}
          <Button variant="ghost" onClick={() => void notes.refetch()}>
            重试
          </Button>
        </p>
      ) : null}
      <div className="notebook-layout">
        <aside className="note-list">
          <div className="note-list__search">
            <Search size={16} />
            <input
              aria-label="搜索笔记"
              placeholder="搜索你的想法…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="note-list__tabs">
            <button type="button" aria-pressed={!archived} onClick={() => setParams({})}>
              全部笔记
            </button>
            <button
              type="button"
              aria-pressed={archived}
              onClick={() => setParams({ archived: "true" })}
            >
              已归档
            </button>
            <span>{notes.data?.length ?? 0}</span>
          </div>
          {notes.isLoading ? (
            <p className="muted">正在打开笔记…</p>
          ) : filtered.length === 0 ? (
            <p className="note-list__empty">
              {query ? "没有匹配的笔记" : "留一点空间，给新的想法。"}
            </p>
          ) : (
            filtered.map((note) => (
              <button
                className={`note-list-item${selected?.id === note.id ? " is-selected" : ""}`}
                type="button"
                key={note.id}
                onClick={() =>
                  setParams({ note: note.id, ...(archived ? { archived: "true" } : {}) })
                }
              >
                <span>
                  <FileText size={16} />
                  <strong>{note.title}</strong>
                  {note.pinned ? <Pin size={12} /> : null}
                </span>
                <p>{note.content.slice(0, 100) || "还没有正文，继续写下你的想法。"}</p>
                <time>
                  {new Date(note.updatedAt).toLocaleDateString("zh-CN", {
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </button>
            ))
          )}
        </aside>
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onSaved={invalidate}
            onDirtyChange={setDirty}
            discarding={discarding}
            creating={create.isPending}
          />
        ) : (
          <div className="notebook-empty">
            <EmptyState
              icon={Lightbulb}
              title="好想法，值得留下来"
              description="研究摘录、会议思考、灵感草稿，在这里形成你的个人知识库。"
              action={
                <Button onClick={requestCreate} loading={create.isPending}>
                  写下第一篇笔记
                </Button>
              }
            />
          </div>
        )}
      </div>
      {confirmNew ? (
        <DialogSurface
          ariaLabel="未保存的笔记"
          className="dialog"
          onClose={() => setConfirmNew(false)}
        >
          <h2>先安放好刚才的想法</h2>
          <p>当前笔记尚未保存。可以返回继续编辑，或放弃修改并新建。</p>
          <div className="button-row">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmNew(false)
                setDiscarding(true)
                create.mutate()
              }}
            >
              放弃修改并新建
            </Button>
            <Button onClick={() => setConfirmNew(false)}>返回笔记</Button>
          </div>
        </DialogSurface>
      ) : null}
    </div>
  )
}
