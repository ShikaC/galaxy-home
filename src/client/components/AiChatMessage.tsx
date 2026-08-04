import type { AiReference } from "../../shared/ai.js"

type DisplayMessage = {
  readonly role: "user" | "assistant"
  readonly content: string
  readonly references: readonly AiReference[]
}

export function AiChatMessage({
  message,
  nickname,
  onRemember,
}: {
  readonly message: DisplayMessage
  readonly nickname: string
  readonly onRemember: (content: string) => void
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
      )}
    </div>
  )
}
