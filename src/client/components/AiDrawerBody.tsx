import { Bot, Settings } from "lucide-react"
import { useEffect, useRef } from "react"
import { Link } from "react-router"
import type { AiMessage, AiReference } from "../../shared/ai.js"
import type { PendingChatAction } from "../../shared/aiChatActions.js"
import { AiChatMessage } from "./AiChatMessage.js"
import { AiMemoryConfirmation } from "./AiMemoryConfirmation.js"
import { Badge } from "./ui/Status.js"

export type AiDrawerMessage = {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly content: string
  readonly references: readonly AiReference[]
  readonly pendingAction?: PendingChatAction | null
  readonly proposedMemory?: { readonly content: string; readonly kind: string } | null
}

export function AiDrawerBody({
  configured,
  error,
  memoryContent,
  memoryKind,
  messages,
  nickname,
  onCancelMemory,
  onClose,
  onRemember,
  onSavedMemory,
  onMessageUpdate,
  onAcceptProposedMemory,
}: {
  readonly configured: boolean
  readonly error: string | null
  readonly memoryContent: string | null
  readonly memoryKind?: "preference" | "goal" | "background"
  readonly messages: readonly AiDrawerMessage[]
  readonly nickname: string
  readonly onCancelMemory: () => void
  readonly onClose: () => void
  readonly onRemember: (content: string, kind?: "preference" | "goal" | "background") => void
  readonly onSavedMemory: () => void
  readonly onMessageUpdate?: (message: AiMessage, confirmation?: string) => void
  readonly onAcceptProposedMemory?: (
    content: string,
    kind: "preference" | "goal" | "background",
  ) => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const end = endRef.current
    if (end === null) return
    end.scrollIntoView({ block: "end" })
  }, [messages, error, memoryContent])
  return (
    <>
      <div className="drawer__body">
        {!configured ? (
          <div className="ai-unavailable">
            <Bot size={24} />
            <h3>AI 尚未配置</h3>
            <p>
              待办、习惯、项目手动推进和回顾仍可正常使用。<span className="cjk-keep">配置服务</span>
              后可继续当前会话。
            </p>
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
            <span>
              可以一起讨论安排；开放模式下，已支持的操作会真正写入并记入操作记录；保守模式会先请你确认。
            </span>
          </div>
        ) : (
          messages.map((message) => (
            <AiChatMessage
              key={message.id}
              message={message}
              nickname={nickname}
              onRemember={(content) => onRemember(content)}
              {...(onAcceptProposedMemory === undefined
                ? {}
                : { onAcceptProposedMemory })}
              {...(onMessageUpdate === undefined ? {} : { onMessageUpdate })}
            />
          ))
        )}
        {error === null ? null : (
          <div className="ai-pending">
            <Badge tone="waiting">等待分析</Badge>
            <p>{error}</p>
          </div>
        )}
        <div aria-hidden="true" ref={endRef} />
      </div>
      {memoryContent === null ? null : (
        <AiMemoryConfirmation
          content={memoryContent}
          onCancel={onCancelMemory}
          onSaved={onSavedMemory}
          {...(memoryKind === undefined ? {} : { initialKind: memoryKind })}
        />
      )}
    </>
  )
}
