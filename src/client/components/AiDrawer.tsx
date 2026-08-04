import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bot, History, Pencil, Plus, Send, Settings, Trash2, X } from "lucide-react"
import { useState } from "react"
import { Link, useLocation } from "react-router"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"
import { chatResponseSchema, messagesSchema } from "../lib/schemas.js"
import { IconButton } from "./ui/IconButton.js"
import { Badge } from "./ui/Status.js"

type LocalMessage = {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly content: string
}

const PAGE_LABELS: Readonly<Record<string, string>> = {
  "/": "首页",
  "/habits": "习惯",
  "/projects": "项目",
  "/review": "回顾",
  "/settings": "设置",
  "/todos": "待办",
}

export function AiDrawer({
  onClose,
  open,
}: {
  readonly onClose: () => void
  readonly open: boolean
}) {
  const meta = useMeta()
  const location = useLocation()
  const client = useQueryClient()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [messages, setMessages] = useState<readonly LocalMessage[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState("")
  const send = useMutation({
    mutationFn: (message: string) =>
      apiRequest("/api/ai/chat", chatResponseSchema, {
        method: "POST",
        body: jsonBody({ conversationId, content: message }),
      }),
    onMutate: (message) => {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content: message },
      ])
      setContent("")
    },
    onSuccess: (result) => {
      setConversationId(result.conversationId)
      setMessages((current) => [
        ...current,
        { id: result.message.id, role: "assistant", content: result.message.content },
      ])
      void client.invalidateQueries({ queryKey: queryKeys.meta })
    },
  })
  const loadConversation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ai/conversations/${id}/messages`, messagesSchema),
    onSuccess: (result, id) => {
      setConversationId(id)
      setMessages(
        result.map((message) => ({
          id: message.id,
          role: message.role === "user" ? "user" : "assistant",
          content: message.content,
        })),
      )
      setHistoryOpen(false)
    },
  })
  const rename = useMutation({
    mutationFn: ({ id, title }: { readonly id: string; readonly title: string }) =>
      apiVoid(`/api/ai/conversations/${id}`, {
        method: "PATCH",
        body: jsonBody({ title }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/ai/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      if (conversationId === id) {
        setConversationId(null)
        setMessages([])
      }
      void client.invalidateQueries({ queryKey: queryKeys.meta })
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  if (!open) return null
  const configured = meta.data?.ai.configured ?? false
  const nickname = meta.data?.settings.aiNickname ?? "星伴"
  const currentPage = location.pathname.startsWith("/projects/")
    ? "项目"
    : (PAGE_LABELS[location.pathname] ?? "当前页")
  const conversations = (meta.data?.conversations ?? []).filter((conversation) =>
    conversation.title.toLowerCase().includes(historySearch.toLowerCase()),
  )
  return (
    <aside aria-label={`${nickname} AI 助手`} className="ai-drawer">
      <header className="drawer__header">
        <div>
          <span className="drawer__title">
            <Bot size={19} />
            <strong>{nickname}</strong>
          </span>
          <Badge tone={configured ? "positive" : "waiting"}>
            {configured ? "已连接" : "未配置"}
          </Badge>
        </div>
        <IconButton label="关闭 AI 助手" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="drawer__toolbar">
        <button
          className="text-action"
          onClick={() => {
            setConversationId(null)
            setMessages([])
          }}
          type="button"
        >
          <Plus size={15} />
          新会话
        </button>
        <button
          className="text-action"
          onClick={() => setHistoryOpen((value) => !value)}
          type="button"
        >
          <History size={15} />
          会话
        </button>
        <span className="drawer__context" title={`当前页：${currentPage}`}>
          {meta.data?.settings.aiPermission === "open" ? "开放模式" : "保守模式"} · {currentPage}
        </span>
      </div>
      {historyOpen ? (
        <section aria-label="AI 会话历史" className="drawer__history">
          <input
            aria-label="搜索 AI 会话"
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="搜索会话"
            value={historySearch}
          />
          {conversations.length === 0 ? <p>暂无匹配会话</p> : null}
          {conversations.map((conversation) => (
            <div key={conversation.id}>
              <button
                className={conversationId === conversation.id ? "selected" : ""}
                onClick={() => loadConversation.mutate(conversation.id)}
                type="button"
              >
                {conversation.title}
              </button>
              <IconButton
                label={`重命名 ${conversation.title}`}
                onClick={() => {
                  const title = window.prompt("重命名会话", conversation.title)?.trim()
                  if (title) rename.mutate({ id: conversation.id, title })
                }}
              >
                <Pencil size={14} />
              </IconButton>
              <IconButton
                label={`删除 ${conversation.title}`}
                onClick={() => remove.mutate(conversation.id)}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
        </section>
      ) : null}
      <div className="drawer__body">
        {!configured ? (
          <div className="ai-unavailable">
            <Bot size={24} />
            <h3>AI 尚未配置</h3>
            <p>待办、习惯、项目手动推进和回顾仍可正常使用。配置服务后可继续当前会话。</p>
            <Link
              className="button button--secondary button--regular"
              onClick={onClose}
              to="/settings"
            >
              <Settings size={16} />
              前往设置
            </Link>
          </div>
        ) : messages.length === 0 ? (
          <div className="ai-welcome">
            <p>今天想一起理清什么？</p>
            <span>我会先理解精力与阻碍，再把下一步缩小到可以开始。</span>
          </div>
        ) : (
          messages.map((message) => (
            <div className={`chat-message chat-message--${message.role}`} key={message.id}>
              <span>{message.role === "user" ? "你" : nickname}</span>
              <p>{message.content}</p>
              {message.role === "assistant" ? <small>参考：当前对话</small> : null}
            </div>
          ))
        )}
        {send.isError ? <p className="inline-error">{send.error.message}</p> : null}
      </div>
      <form
        className="drawer__composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (content.trim()) send.mutate(content.trim())
        }}
      >
        <textarea
          aria-label="给 AI 发送消息"
          disabled={!configured}
          onChange={(event) => setContent(event.target.value)}
          placeholder={configured ? "写下你卡住的地方..." : "请先在设置中配置 AI 服务"}
          rows={3}
          value={content}
        />
        <IconButton
          disabled={!configured || !content.trim() || send.isPending}
          label="发送消息"
          type="submit"
        >
          <Send size={18} />
        </IconButton>
      </form>
    </aside>
  )
}
