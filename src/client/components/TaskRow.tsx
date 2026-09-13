import {
  Archive,
  CalendarPlus,
  Copy,
  Focus,
  FolderPlus,
  ListPlus,
  Pencil,
  Repeat2,
  SkipForward,
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
  onManageSeries,
  onOrganize,
  onSecondary,
  onSkip,
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
  readonly onManageSeries?: (() => void) | undefined
  readonly onOrganize?: (() => void) | undefined
  readonly onSecondary?: (() => void) | undefined
  readonly onSkip?: (() => void) | undefined
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
    ...(onManageSeries
      ? [{ icon: Repeat2, label: "管理重复系列", onSelect: onManageSeries, opensDialog: true }]
      : []),
    ...(onEdit ? [{ icon: Pencil, label: "编辑待办", onSelect: onEdit }] : []),
    ...(onCopy ? [{ icon: Copy, label: "复制待办", onSelect: onCopy }] : []),
    ...(onConvertProject
      ? [{ icon: FolderPlus, label: "转为新项目", onSelect: onConvertProject }]
      : []),
    ...(onArchive ? [{ icon: Archive, label: "归档", onSelect: onArchive }] : []),
    ...(onSkip ? [{ icon: SkipForward, label: "跳过本次", onSelect: onSkip }] : []),
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
          {item.priority !== "none" ? (
            item.priority === "high" ? (
              <Badge tone="waiting">高优先</Badge>
            ) : (
              <Badge>{item.priority === "medium" ? "中优先" : "低优先"}</Badge>
            )
          ) : null}
          {item.isFocus ? <Badge tone="positive">今日重点</Badge> : null}
          {item.isSecondary ? <Badge>临时小事</Badge> : null}
          {item.isTutorial ? <Badge tone="waiting">教学示例</Badge> : null}
          {item.dueAt ? (
            <time title="时间截止">
              截止
              {new Date(item.dueAt).toLocaleString("zh-CN", {
                timeZone: timezone,
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          ) : null}
          {item.dueDate ? <time title="日期截止">截止 {item.dueDate.slice(5)}</time> : null}
          {item.scheduledStartAt && item.scheduledEndAt ? (
            <time title={item.isFixed ? "固定日程" : "安排时段"}>
              {item.isFixed ? "固定 " : "安排 "}
              {new Date(item.scheduledStartAt).toLocaleString("zh-CN", {
                timeZone: item.scheduleTimezone ?? timezone,
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              –
              {new Date(item.scheduledEndAt).toLocaleTimeString("zh-CN", {
                timeZone: item.scheduleTimezone ?? timezone,
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          ) : null}
          {item.estimatedMinutes ? <span>预计 {item.estimatedMinutes} 分钟</span> : null}
          {item.reminders.length ? <span>{item.reminders.length} 个提醒</span> : null}
          {item.recurrenceSeriesId ? <Badge>重复 · {item.recurrenceDate}</Badge> : null}
          {item.subtaskCount > 0 ? (
            <span>
              子任务 {item.completedSubtaskCount}/{item.subtaskCount}
            </span>
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
