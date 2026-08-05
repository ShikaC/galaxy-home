import { Send } from "lucide-react"
import { IconButton } from "./ui/IconButton.js"

export function AiDrawerComposer({
  configured,
  content,
  onChange,
  onSubmit,
  pending,
}: {
  readonly configured: boolean
  readonly content: string
  readonly onChange: (content: string) => void
  readonly onSubmit: () => void
  readonly pending: boolean
}) {
  return (
    <form
      className="drawer__composer"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <textarea
        aria-label="给 AI 发送消息"
        disabled={!configured || pending}
        onChange={(event) => onChange(event.target.value)}
        placeholder={configured ? "写下你卡住的地方..." : "请先在设置中配置 AI 服务"}
        rows={3}
        value={content}
      />
      <IconButton
        disabled={!configured || !content.trim() || pending}
        label="发送消息"
        type="submit"
      >
        <Send size={18} />
      </IconButton>
    </form>
  )
}
