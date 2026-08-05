import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bot, History, Plus, Send, Settings, X } from "lucide-react"
import { useState } from "react"
import { Link, useLocation } from "react-router"
import type { AiReference } from "../../shared/ai.js"
import { streamAiChat } from "../lib/aiStream.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"
import { messagesSchema } from "../lib/schemas.js"
import { AiChatMessage } from "./AiChatMessage.js"
import { AiConversationHistory } from "./AiConversationHistory.js"
import { AiMemoryConfirmation } from "./AiMemoryConfirmation.js"
import { AiPermissionControl } from "./AiPermissionControl.js"
import { IconButton } from "./ui/IconButton.js"
import { DrawerSurface } from "./ui/ModalSurface.js"
import { Badge } from "./ui/Status.js"

type LocalMessage = {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly content: string
  readonly references: readonly AiReference[]
}

type PendingMessage = {
  readonly message: string
  readonly placeholderId: string
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
  const [memoryContent, setMemoryContent] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: ({ message, placeholderId }: PendingMessage) =>
      streamAiChat(
        {
          conversationId,
          content: message,
          currentPath: location.pathname,
          currentLabel: location.pathname.startsWith("/projects/")
            ? "项目"
            : (PAGE_LABELS[location.pathname] ?? "当前页"),
        },
        (delta) =>
          setMessages((current) =>
            current.map((entry) =>
              entry.id === placeholderId ? { ...entry, content: entry.content + delta } : entry,
            ),
          ),
      ),
    onMutate: ({ message, placeholderId }) => {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content: message, references: [] },
        { id: placeholderId, role: "assistant", content: "", references: [] },
      ])
    },
    onSuccess: (result, variables) => {
      setConversationId(result.conversationId)
      setMessages((current) =>
        current.map((entry) =>
          entry.id === variables.placeholderId
            ? {
                id: result.message.id,
                role: "assistant",
                content: result.message.content,
                references: result.message.references,
              }
            : entry,
        ),
      )
      setContent("")
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
          references: message.references,
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
    <DrawerSurface ariaLabel={`${nickname} AI 助手`} onClose={onClose}>
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
        <AiPermissionControl />
        <span className="drawer__context" title={`当前页：${currentPage}`}>
          {currentPage}
        </span>
      </div>
      {historyOpen ? (
        <AiConversationHistory
          conversations={conversations}
          onDelete={(id) => remove.mutate(id)}
          onLoad={(id) => loadConversation.mutate(id)}
          onRename={(id, title) => rename.mutate({ id, title })}
          onSearch={setHistorySearch}
          search={historySearch}
          selectedId={conversationId}
        />
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
            <AiChatMessage
              key={message.id}
              message={message}
              nickname={nickname}
              onRemember={setMemoryContent}
            />
          ))
        )}
        {send.isError ? (
          <div className="ai-pending">
            <Badge tone="waiting">等待分析</Badge>
            <p>{send.error.message}</p>
          </div>
        ) : null}
      </div>
      {memoryContent === null ? null : (
        <AiMemoryConfirmation
          content={memoryContent}
          onCancel={() => setMemoryContent(null)}
          onSaved={() => {
            setMemoryContent(null)
            void client.invalidateQueries({ queryKey: queryKeys.meta })
          }}
        />
      )}
      <form
        className="drawer__composer"
        onSubmit={(event) => {
          event.preventDefault()
          const message = content.trim()
          if (message) send.mutate({ message, placeholderId: crypto.randomUUID() })
        }}
      >
        <textarea
          aria-label="给 AI 发送消息"
          disabled={!configured || send.isPending}
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
    </DrawerSurface>
  )
}
