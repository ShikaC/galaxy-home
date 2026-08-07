import {
  Archive,
  CalendarPlus,
  Copy,
  Focus,
  FolderPlus,
  ListPlus,
  Pencil,
  Trash2,
} from "lucide-react"
import type { Item } from "../../shared/items.js"
import { useAppTime } from "./AppContext.js"
import { type TaskAction, TaskActionsMenu } from "./TaskActionsMenu.js"
import { NaturalText } from "./ui/NaturalText.js"
import { Badge } from "./ui/Status.js"

export function TaskRow({
  item,
  onArchive,
  onComplete,
  onConvertProject,
  onCopy,
  onDelete,
  onEdit,
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
  readonly onEdit?: (() => void) | undefined
  readonly onFocus?: (() => void) | undefined
  readonly onOrganize?: (() => void) | undefined
  readonly onSecondary?: (() => void) | undefined
  readonly onToday?: (() => void) | undefined
}) {
  const { timezone } = useAppTime()
  const actions: readonly TaskAction[] = [
    ...(onToday
      ? [
          {
            icon: CalendarPlus,
            label: item.inToday ? "已在今日待办" : "加入今日待办",
            onSelect: onToday,
          },
        ]
      : []),
    ...(onSecondary ? [{ icon: ListPlus, label: "加入临时小事", onSelect: onSecondary }] : []),
    ...(onFocus ? [{ icon: Focus, label: "设为今日重点", onSelect: onFocus }] : []),
    ...(onOrganize
      ? [
          {
            icon: FolderPlus,
            label: "整理分类与项目",
            onSelect: onOrganize,
            opensDialog: true,
          },
        ]
      : []),
    ...(onEdit ? [{ icon: Pencil, label: "编辑待办", onSelect: onEdit }] : []),
    ...(onCopy ? [{ icon: Copy, label: "复制待办", onSelect: onCopy }] : []),
    ...(onConvertProject
      ? [{ icon: FolderPlus, label: "转为新项目", onSelect: onConvertProject }]
      : []),
    ...(onArchive ? [{ icon: Archive, label: "归档", onSelect: onArchive }] : []),
    ...(onDelete ? [{ icon: Trash2, label: "移到回收站", onSelect: onDelete }] : []),
  ]
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
        <strong>
          <NaturalText text={item.title} />
        </strong>
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
        {item.notes ? (
          <p>
            <NaturalText text={item.notes} />
          </p>
        ) : null}
      </div>
      {actions.length > 0 ? <TaskActionsMenu actions={actions} /> : null}
    </article>
  )
}
