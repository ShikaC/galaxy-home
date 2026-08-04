import { Copy, Minus, Pencil, Plus, Trash2 } from "lucide-react"
import type { Habit } from "../../shared/habits.js"
import { IconButton } from "./ui/IconButton.js"
import { Badge } from "./ui/Status.js"

export function HabitRow({
  habit,
  onCopy,
  onDelete,
  onEdit,
  onRecord,
  onUndo,
}: {
  readonly habit: Habit
  readonly onCopy?: () => void
  readonly onDelete?: () => void
  readonly onEdit?: () => void
  readonly onRecord: () => void
  readonly onUndo: () => void
}) {
  return (
    <article className={`habit-row${habit.completedToday ? " habit-row--done" : ""}`}>
      <button
        aria-label={`记录 ${habit.name}`}
        className="habit-complete"
        disabled={habit.todayStatus === "leave" || habit.isRestDay}
        onClick={onRecord}
        type="button"
      >
        <Plus size={17} />
      </button>
      <div className="habit-row__body">
        <div>
          <strong>{habit.name}</strong>
          {habit.isTutorial ? <Badge tone="waiting">教学示例</Badge> : null}
          {habit.todayStatus === "leave" ? <Badge tone="waiting">今日请假</Badge> : null}
          {habit.isRestDay ? <Badge>今日休息</Badge> : null}
          {habit.correctedToday ? <Badge tone="attention">已修正</Badge> : null}
        </div>
        <p>
          {habit.frequencyType === "daily"
            ? `已连续打卡 ${habit.streak} 天`
            : `已打卡 ${habit.totalCheckIns} 次`}
        </p>
      </div>
      <strong className="habit-count">
        {habit.currentCount}/{habit.targetCount}
      </strong>
      <IconButton
        disabled={habit.currentCount === 0 || habit.todayStatus === "leave" || habit.isRestDay}
        label={`撤销 ${habit.name} 最近一次记录`}
        onClick={onUndo}
      >
        <Minus size={17} />
      </IconButton>
      {onEdit === undefined && onCopy === undefined && onDelete === undefined ? null : (
        <div className="habit-row__actions">
          {onEdit === undefined ? null : (
            <IconButton label={`编辑 ${habit.name}`} onClick={onEdit}>
              <Pencil size={16} />
            </IconButton>
          )}
          {onCopy === undefined ? null : (
            <IconButton label={`复制 ${habit.name}`} onClick={onCopy}>
              <Copy size={16} />
            </IconButton>
          )}
          {onDelete === undefined ? null : (
            <IconButton label={`删除 ${habit.name}`} onClick={onDelete}>
              <Trash2 size={16} />
            </IconButton>
          )}
        </div>
      )}
    </article>
  )
}
