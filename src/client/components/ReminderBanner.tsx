import { Bell, Clock3, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { Item } from "../../shared/items.js"
import type { WorkspaceSettings } from "../../shared/settings.js"
import { localDate } from "../lib/api.js"
import { Button } from "./ui/Button.js"
import { IconButton } from "./ui/IconButton.js"

type Reminder = { readonly id: string; readonly title: string; readonly detail: string }

function currentReminder(
  settings: WorkspaceSettings,
  now: Date,
  items: readonly Item[],
): Reminder | null {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  const deadline = items
    .filter((item) => {
      if (item.dueAt === null || item.reminderMinutes === null) return false
      return now.getTime() >= new Date(item.dueAt).getTime() - item.reminderMinutes * 60_000
    })
    .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))[0]
  if (deadline?.dueAt)
    return {
      id: `deadline:${deadline.id}`,
      title: `待办提醒：${deadline.title}`,
      detail: `截止时间 ${new Date(deadline.dueAt).toLocaleString("zh-CN")}`,
    }
  if (now.getDay() === 0 && settings.weeklyReviewEnabled && time >= settings.weeklyReviewTime)
    return {
      id: "weekly",
      title: "本周可以轻轻收尾了",
      detail: "回顾会汇总周一至周日的完成、习惯、项目与收获。",
    }
  if (settings.eveningReminderEnabled && time >= settings.eveningReminderTime)
    return {
      id: "evening",
      title: "今天有什么值得留下？",
      detail: "写下一条收获就好，不必总结完整的一天。",
    }
  if (settings.morningReminderEnabled && time >= settings.morningReminderTime)
    return {
      id: "morning",
      title: "今天最想推进什么？",
      detail: "从收集箱选择一件，或保留一个足够小的今日重点。",
    }
  return null
}

export function ReminderBanner({
  items,
  settings,
}: {
  readonly items: readonly Item[]
  readonly settings: WorkspaceSettings
}) {
  const [tick, setTick] = useState(() => Date.now())
  const [snoozedUntil, setSnoozedUntil] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const reminder = useMemo(
    () => currentReminder(settings, new Date(tick), items),
    [items, settings, tick],
  )
  if (
    reminder === null ||
    tick < snoozedUntil ||
    window.localStorage.getItem(`reminder:${localDate()}:${reminder.id}`) === "dismissed"
  )
    return null
  return (
    <aside className="reminder-banner" role="status">
      <Bell size={17} />
      <div>
        <strong>{reminder.title}</strong>
        <span>{reminder.detail}</span>
      </div>
      <Button
        onClick={() => setSnoozedUntil(Date.now() + 30 * 60_000)}
        size="compact"
        variant="ghost"
      >
        <Clock3 size={15} />
        30 分钟后
      </Button>
      <IconButton
        label="今天不再提醒"
        onClick={() => {
          window.localStorage.setItem(`reminder:${localDate()}:${reminder.id}`, "dismissed")
          setTick(Date.now())
        }}
      >
        <X size={17} />
      </IconButton>
    </aside>
  )
}
