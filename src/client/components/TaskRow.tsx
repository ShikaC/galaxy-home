import {
  Archive,
  CalendarPlus,
  Copy,
  Focus,
  FolderPlus,
  ListPlus,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import type { Item } from "../../shared/items.js"
import { useAppTime } from "./AppContext.js"
import { IconButton } from "./ui/IconButton.js"
import { Badge } from "./ui/Status.js"

export function TaskRow({
  item,
  onArchive,
  onComplete,
  onConvertProject,
  onCopy,
  onDelete,
  onFocus,
  onOrganize,
  onSecondary,
  onToday,
}: {
  readonly item: Item
  readonly onArchive?: (() => void) | undefined
  readonly onComplete: () => void
  readonly onConvertProject?: (() => void) | undefined
  readonly onCopy?: (() => void) | undefined
  readonly onDelete?: (() => void) | undefined
  readonly onFocus?: (() => void) | undefined
  readonly onOrganize?: (() => void) | undefined
  readonly onSecondary?: (() => void) | undefined
  readonly onToday?: (() => void) | undefined
}) {
  const { timezone } = useAppTime()
  return (
    <article className={`task-row${item.status === "completed" ? " task-row--completed" : ""}`}>
      <button
        aria-label={item.status === "completed" ? `重新打开 ${item.title}` : `完成 ${item.title}`}
        className="task-check"
        onClick={onComplete}
        type="button"
      >
        <span />
      </button>
      <div className="task-row__body">
        <strong>{item.title}</strong>
        <div className="task-meta">
          {item.isFocus ? <Badge tone="positive">今日重点</Badge> : null}
          {item.isSecondary ? <Badge>临时小事</Badge> : null}
          {item.isTutorial ? <Badge tone="waiting">教学示例</Badge> : null}
          {item.dueAt ? (
            <time>
              {new Date(item.dueAt).toLocaleString("zh-CN", {
                timeZone: timezone,
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          ) : null}
        </div>
        {item.notes ? <p>{item.notes}</p> : null}
      </div>
      <div className="task-row__actions">
        {onToday ? (
          <IconButton label={item.inToday ? "已在今日待办" : "加入今日待办"} onClick={onToday}>
            <CalendarPlus size={17} />
          </IconButton>
        ) : null}
        {onSecondary ? (
          <IconButton label="加入临时小事" onClick={onSecondary}>
            <ListPlus size={17} />
          </IconButton>
        ) : null}
        {onFocus ? (
          <IconButton label="设为今日重点" onClick={onFocus}>
            <Focus size={17} />
          </IconButton>
        ) : null}
        {onOrganize ? (
          <IconButton label="整理分类与项目" onClick={onOrganize}>
            <MoreHorizontal size={18} />
          </IconButton>
        ) : null}
        {onCopy ? (
          <IconButton label="复制待办" onClick={onCopy}>
            <Copy size={17} />
          </IconButton>
        ) : null}
        {onConvertProject ? (
          <IconButton label="转为新项目" onClick={onConvertProject}>
            <FolderPlus size={17} />
          </IconButton>
        ) : null}
        {onArchive ? (
          <IconButton label="归档" onClick={onArchive}>
            <Archive size={17} />
          </IconButton>
        ) : null}
        {onDelete ? (
          <IconButton label="移到回收站" onClick={onDelete}>
            <Trash2 size={17} />
          </IconButton>
        ) : null}
      </div>
    </article>
  )
}
