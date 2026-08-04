import { Pencil, Trash2 } from "lucide-react"
import { IconButton } from "./ui/IconButton.js"

type Conversation = {
  readonly id: string
  readonly title: string
}

export function AiConversationHistory({
  conversations,
  onDelete,
  onLoad,
  onRename,
  onSearch,
  search,
  selectedId,
}: {
  readonly conversations: readonly Conversation[]
  readonly onDelete: (id: string) => void
  readonly onLoad: (id: string) => void
  readonly onRename: (id: string, title: string) => void
  readonly onSearch: (value: string) => void
  readonly search: string
  readonly selectedId: string | null
}) {
  return (
    <section aria-label="AI 会话历史" className="drawer__history">
      <input
        aria-label="搜索 AI 会话"
        onChange={(event) => onSearch(event.target.value)}
        placeholder="搜索会话"
        value={search}
      />
      {conversations.length === 0 ? <p>暂无匹配会话</p> : null}
      {conversations.map((conversation) => (
        <div key={conversation.id}>
          <button
            className={selectedId === conversation.id ? "selected" : ""}
            onClick={() => onLoad(conversation.id)}
            type="button"
          >
            {conversation.title}
          </button>
          <IconButton
            label={`重命名 ${conversation.title}`}
            onClick={() => {
              const title = window.prompt("重命名会话", conversation.title)?.trim()
              if (title) onRename(conversation.id, title)
            }}
          >
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label={`删除 ${conversation.title}`}
            onClick={() => onDelete(conversation.id)}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
    </section>
  )
}
