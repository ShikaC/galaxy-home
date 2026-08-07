import type { AiMessage, AiReference } from "../../shared/ai.js"
import type { PendingChatAction } from "../../shared/aiChatActions.js"
import { AiPendingActionCard } from "./AiPendingActionCard.js"
import { Button } from "./ui/Button.js"

type DisplayMessage = {
  readonly id?: string
  readonly role: "user" | "assistant"
  readonly content: string
  readonly references: readonly AiReference[]
  readonly pendingAction?: PendingChatAction | null
  readonly proposedMemory?: { readonly content: string; readonly kind: string } | null
}

export function AiChatMessage({
  message,
  nickname,
  onRemember,
  onMessageUpdate,
  onAcceptProposedMemory,
}: {
  readonly message: DisplayMessage
  readonly nickname: string
  readonly onRemember: (content: string) => void
  readonly onMessageUpdate?: (message: AiMessage, confirmation?: string) => void
  readonly onAcceptProposedMemory?: (content: string, kind: "preference" | "goal" | "background") => void
}) {
  const user = message.role === "user"
  return (
    <div className={`chat-message chat-message--${user ? "user" : "assistant"}`}>
      <span className="chat-message__author">{user ? "你" : nickname}</span>
      <p>{message.content}</p>
      {user ? (
        <button
          className="text-action chat-message__remember"
          onClick={() => onRemember(message.content)}
          type="button"
        >
          记住这条
        </button>
      ) : (
        <>
          {message.id !== undefined &&
          message.pendingAction !== null &&
          message.pendingAction !== undefined &&
          onMessageUpdate !== undefined ? (
            <AiPendingActionCard
              messageId={message.id}
              onUpdated={onMessageUpdate}
              pendingAction={message.pendingAction}
            />
          ) : null}
          {message.proposedMemory !== null &&
          message.proposedMemory !== undefined &&
          onAcceptProposedMemory !== undefined ? (
            <div className="ai-pending-action">
              <p>建议记住（{message.proposedMemory.kind}）：{message.proposedMemory.content}</p>
              <Button
                onClick={() =>
                  onAcceptProposedMemory(
                    message.proposedMemory!.content,
                    message.proposedMemory!.kind as "preference" | "goal" | "background",
                  )
                }
                size="compact"
              >
                确认保存记忆
              </Button>
            </div>
          ) : null}
          <details className="chat-references">
            <summary>参考了 {message.references.length} 项本地内容</summary>
            <ul>
              {message.references.map((reference) => (
                <li key={`${reference.type}:${reference.id ?? reference.label}`}>
                  {reference.label}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  )
}
