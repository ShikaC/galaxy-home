import { Bot, History, Plus, X } from "lucide-react"
import { AiPermissionControl } from "./AiPermissionControl.js"
import { IconButton } from "./ui/IconButton.js"
import { Badge } from "./ui/Status.js"

export function AiDrawerHeader({
  configured,
  currentPage,
  nickname,
  onClose,
  onNewConversation,
  onToggleHistory,
}: {
  readonly configured: boolean
  readonly currentPage: string
  readonly nickname: string
  readonly onClose: () => void
  readonly onNewConversation: () => void
  readonly onToggleHistory: () => void
}) {
  return (
    <>
      <header className="drawer__header">
        <div>
          <span className="drawer__title">
            <Bot aria-hidden="true" size={19} />
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
        <button className="text-action" onClick={onNewConversation} type="button">
          <Plus size={15} />
          新会话
        </button>
        <button className="text-action" onClick={onToggleHistory} type="button">
          <History size={15} />
          会话
        </button>
        <AiPermissionControl />
        <span className="drawer__context" title={`当前页：${currentPage}`}>
          {currentPage}
        </span>
      </div>
    </>
  )
}
