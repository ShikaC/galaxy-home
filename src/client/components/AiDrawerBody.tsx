import { Bot, Settings } from "lucide-react"
import { Link } from "react-router"
import type { AiReference } from "../../shared/ai.js"
import { AiChatMessage } from "./AiChatMessage.js"
import { AiMemoryConfirmation } from "./AiMemoryConfirmation.js"
import { Badge } from "./ui/Status.js"

export type AiDrawerMessage = {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly content: string
  readonly references: readonly AiReference[]
}

export function AiDrawerBody({
  configured,
  error,
  memoryContent,
  messages,
  nickname,
  onCancelMemory,
  onClose,
  onRemember,
  onSavedMemory,
}: {
  readonly configured: boolean
  readonly error: string | null
  readonly memoryContent: string | null
  readonly messages: readonly AiDrawerMessage[]
  readonly nickname: string
  readonly onCancelMemory: () => void
  readonly onClose: () => void
  readonly onRemember: (content: string) => void
  readonly onSavedMemory: () => void
}) {
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
            <span>我会先理解精力与阻碍，再把下一步缩小到可以开始。</span>
          </div>
        ) : (
          messages.map((message) => (
            <AiChatMessage
              key={message.id}
              message={message}
              nickname={nickname}
              onRemember={onRemember}
            />
          ))
        )}
        {error === null ? null : (
          <div className="ai-pending">
            <Badge tone="waiting">等待分析</Badge>
            <p>{error}</p>
          </div>
        )}
      </div>
      {memoryContent === null ? null : (
        <AiMemoryConfirmation
          content={memoryContent}
          onCancel={onCancelMemory}
          onSaved={onSavedMemory}
        />
      )}
    </>
  )
}
