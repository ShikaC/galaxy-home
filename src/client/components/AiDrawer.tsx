import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useLocation } from "react-router"
import { streamAiChat } from "../lib/aiStream.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"
import { messagesSchema } from "../lib/schemas.js"
import { AiConversationHistory } from "./AiConversationHistory.js"
import { AiDrawerBody, type AiDrawerMessage } from "./AiDrawerBody.js"
import { AiDrawerComposer } from "./AiDrawerComposer.js"
import { AiDrawerHeader } from "./AiDrawerHeader.js"
import { DrawerSurface } from "./ui/ModalSurface.js"

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
  draft = null,
  focusItemId = null,
  onClose,
  onConversationChange,
  open,
  requestedConversationId,
}: {
  readonly draft?: string | null
  readonly focusItemId?: string | null
  readonly onClose: () => void
  readonly onConversationChange: (conversationId: string | null) => void
  readonly open: boolean
  readonly requestedConversationId: string | null
}) {
  const meta = useMeta()
  const location = useLocation()
  const client = useQueryClient()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [activeFocusItemId, setActiveFocusItemId] = useState<string | null>(null)
  const [messages, setMessages] = useState<readonly AiDrawerMessage[]>([])
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
          ...(activeFocusItemId === null ? {} : { focusItemId: activeFocusItemId }),
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
      setActiveFocusItemId(null)
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
  useEffect(() => {
    if (open && requestedConversationId !== null) loadConversation.mutate(requestedConversationId)
  }, [loadConversation.mutate, open, requestedConversationId])
  useEffect(() => {
    if (!open) return
    if (draft !== null) setContent(draft)
    setActiveFocusItemId(focusItemId)
  }, [draft, focusItemId, open])
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
      <AiDrawerHeader
        configured={configured}
        currentPage={currentPage}
        nickname={nickname}
        onClose={onClose}
        onNewConversation={() => {
          setConversationId(null)
          setMessages([])
          onConversationChange(null)
        }}
        onToggleHistory={() => setHistoryOpen((value) => !value)}
      />
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
      <AiDrawerBody
        configured={configured}
        error={send.isError ? send.error.message : null}
        memoryContent={memoryContent}
        messages={messages}
        nickname={nickname}
        onCancelMemory={() => setMemoryContent(null)}
        onClose={onClose}
        onRemember={setMemoryContent}
        onSavedMemory={() => {
          setMemoryContent(null)
          void client.invalidateQueries({ queryKey: queryKeys.meta })
        }}
      />
      <AiDrawerComposer
        configured={configured}
        content={content}
        onChange={setContent}
        onSubmit={() => {
          const message = content.trim()
          if (message) send.mutate({ message, placeholderId: crypto.randomUUID() })
        }}
        pending={send.isPending}
      />
    </DrawerSurface>
  )
}
