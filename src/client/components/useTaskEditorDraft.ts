import { useState } from "react"
import type { Item } from "../../shared/items.js"
import { localOccurrenceInstant, RecurrenceLocalTimeError } from "../../shared/recurrence.js"
import { localDateTimeInputFor } from "../lib/date.js"

export type ReminderDraft = {
  readonly anchor: "due" | "scheduled"
  readonly offsetMinutes: number
}

export type TaskEditorDraft = {
  readonly categoryIds: readonly string[]
  readonly dueAt: string
  readonly dueDate: string
  readonly estimatedMinutes: string
  readonly isFixed: boolean
  readonly notes: string
  readonly parentId: string
  readonly priority: Item["priority"]
  readonly projectIds: readonly string[]
  readonly reminders: readonly ReminderDraft[]
  readonly scheduledEndAt: string
  readonly scheduledStartAt: string
  readonly title: string
}

function draftFor(item: Item, timezone: string): TaskEditorDraft {
  return {
    categoryIds: item.categoryIds,
    dueAt: item.dueAt === null ? "" : localDateTimeInputFor(item.dueAt, timezone),
    dueDate: item.dueDate ?? "",
    estimatedMinutes: item.estimatedMinutes?.toString() ?? "",
    isFixed: item.isFixed,
    notes: item.notes ?? "",
    parentId: item.parentId ?? "",
    priority: item.priority,
    projectIds: item.projectIds,
    reminders: item.reminders
      .filter((reminder) => reminder.enabled)
      .map(({ anchor, offsetMinutes }) => ({ anchor, offsetMinutes })),
    scheduledEndAt:
      item.scheduledEndAt === null ? "" : localDateTimeInputFor(item.scheduledEndAt, timezone),
    scheduledStartAt:
      item.scheduledStartAt === null ? "" : localDateTimeInputFor(item.scheduledStartAt, timezone),
    title: item.title,
  }
}

export function strictInstantForLocalInput(value: string, timezone: string): string | null {
  if (value === "") return null
  try {
    return localOccurrenceInstant(value.slice(0, 10), value.slice(11, 16), timezone).toISOString()
  } catch (error) {
    if (error instanceof RecurrenceLocalTimeError) {
      const reason = error.reason === "ambiguous" ? "出现两次" : "不存在"
      throw new RangeError(`这个本地时间在当前时区${reason}，请选择另一个时间。`)
    }
    throw error
  }
}

export function useTaskEditorDraft(item: Item, timezone: string) {
  const [draft, setDraft] = useState<TaskEditorDraft>(() => draftFor(item, timezone))
  const [expectedVersion, setExpectedVersion] = useState(item.version)
  return {
    acknowledgeOwnVersionBump: () => setExpectedVersion((current) => current + 1),
    draft,
    expectedVersion,
    update: (change: Partial<TaskEditorDraft>) =>
      setDraft((current) => ({ ...current, ...change })),
  }
}
