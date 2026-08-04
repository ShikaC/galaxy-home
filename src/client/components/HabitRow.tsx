import { Minus, Plus } from "lucide-react"
import type { Habit } from "../../shared/habits.js"
import { IconButton } from "./ui/IconButton.js"
import { Badge } from "./ui/Status.js"

export function HabitRow({
  habit,
  onRecord,
  onUndo,
}: {
  readonly habit: Habit
  readonly onRecord: () => void
  readonly onUndo: () => void
}) {
  return (
    <article className={`habit-row${habit.completedToday ? " habit-row--done" : ""}`}>
      <button
        aria-label={`记录 ${habit.name}`}
        className="habit-complete"
        onClick={onRecord}
        type="button"
      >
        <Plus size={17} />
      </button>
      <div className="habit-row__body">
        <div>
          <strong>{habit.name}</strong>
          {habit.isTutorial ? <Badge tone="waiting">教学示例</Badge> : null}
        </div>
        <p>
          {habit.frequencyType === "daily"
            ? `已连续打卡 ${habit.streak} 天`
            : `本周已打卡 ${habit.weeklyCount}/${habit.weeklyTarget ?? 1} 天`}
        </p>
      </div>
      <strong className="habit-count">
        {habit.currentCount}/{habit.targetCount}
      </strong>
      <IconButton
        disabled={habit.currentCount === 0}
        label={`撤销 ${habit.name} 最近一次记录`}
        onClick={onUndo}
      >
        <Minus size={17} />
      </IconButton>
    </article>
  )
}
