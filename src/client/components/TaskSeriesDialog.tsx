import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Repeat2, X } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import type { Item } from "../../shared/items.js"
import { type RecurrenceRule, type TaskSeries, taskSeriesSchema } from "../../shared/recurrence.js"
import { ApiError, apiRequest, jsonBody } from "../lib/api.js"
import { invalidateTaskQueries } from "../lib/mutations.js"
import { useAppTime } from "./AppContext.js"
import { type RepeatKind, TaskRepeatFields, type TaskSeriesDraft } from "./TaskRepeatFields.js"
import { Button } from "./ui/Button.js"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"

const taskSeriesListSchema = z.array(taskSeriesSchema).readonly()

function kindFor(rule: RecurrenceRule): RepeatKind {
  if (rule.frequency === "daily") return "daily"
  if (
    rule.frequency === "weekly" &&
    rule.weekdays.length === 5 &&
    rule.weekdays.every((day, index) => day === index + 1)
  )
    return "workday"
  return rule.frequency
}

function draftFor(today: string, series: TaskSeries | null, seed: Item | null): TaskSeriesDraft {
  const rule = series?.rule
  return {
    dayOfMonth: rule?.frequency === "monthly" ? rule.dayOfMonth.toString() : today.slice(8, 10),
    dueTime: series?.dueTime ?? "",
    estimatedMinutes: (series?.estimatedMinutes ?? seed?.estimatedMinutes)?.toString() ?? "",
    interval: rule?.interval.toString() ?? "1",
    kind: rule ? kindFor(rule) : "workday",
    notes: series?.notes ?? seed?.notes ?? "",
    priority: series?.priority ?? seed?.priority ?? "none",
    reminderOffsets: series?.reminders.map((reminder) => reminder.offsetMinutes) ?? [],
    startDate: series?.startDate ?? today,
    title: series?.title ?? seed?.title ?? "",
    untilDate: rule?.untilDate ?? "",
    weekdays: rule?.frequency === "weekly" ? rule.weekdays : [1, 2, 3, 4, 5],
  }
}

function ruleFor(draft: TaskSeriesDraft): RecurrenceRule {
  const interval = Number(draft.interval)
  const untilDate = draft.untilDate || null
  switch (draft.kind) {
    case "daily":
      return { frequency: "daily", interval, untilDate }
    case "workday":
      return { frequency: "weekly", interval, weekdays: [1, 2, 3, 4, 5], untilDate }
    case "weekly":
      return { frequency: "weekly", interval, weekdays: draft.weekdays, untilDate }
    case "monthly":
      return { frequency: "monthly", interval, dayOfMonth: Number(draft.dayOfMonth), untilDate }
  }
}

function SeriesEditor({
  onClose,
  seed,
  series,
}: {
  readonly onClose: () => void
  readonly seed: Item | null
  readonly series: TaskSeries | null
}) {
  const { timezone, today } = useAppTime()
  const client = useQueryClient()
  const [draft, setDraft] = useState(() => draftFor(today, series, seed))
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [failedAttempt, setFailedAttempt] = useState(false)
  const [expectedVersion] = useState(series?.version ?? null)
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...(series === null ? { requestId, startDate: draft.startDate } : { expectedVersion }),
        title: draft.title,
        notes: draft.notes || null,
        priority: draft.priority,
        categoryIds: series?.categoryIds ?? seed?.categoryIds ?? [],
        projectIds: series?.projectIds ?? seed?.projectIds ?? [],
        timezone: series?.timezone ?? timezone,
        rule: ruleFor(draft),
        estimatedMinutes: draft.estimatedMinutes === "" ? null : Number(draft.estimatedMinutes),
        dueTime: draft.dueTime || null,
        reminders: draft.reminderOffsets.map((offsetMinutes) => ({
          anchor: "due" as const,
          offsetMinutes,
        })),
      }
      return apiRequest(
        series === null ? "/api/task-series" : `/api/task-series/${series.id}`,
        taskSeriesSchema,
        { method: series === null ? "POST" : "PATCH", body: jsonBody(payload) },
      )
    },
    onSuccess: async () => {
      await invalidateTaskQueries(client)
      onClose()
    },
    onError: () => setFailedAttempt(true),
  })
  const pause = useMutation({
    mutationFn: () => {
      if (series === null || expectedVersion === null) return Promise.resolve(series)
      return apiRequest(`/api/task-series/${series.id}`, taskSeriesSchema, {
        method: "PATCH",
        body: jsonBody({
          expectedVersion,
          status: series.status === "active" ? "paused" : "active",
        }),
      })
    },
    onSuccess: async () => {
      await invalidateTaskQueries(client)
      onClose()
    },
  })
  return (
    <DialogSurface
      ariaLabelledBy="series-dialog-title"
      className="dialog task-detail-dialog"
      onClose={onClose}
    >
      <header className="dialog__header">
        <div>
          <p className="eyebrow">重复任务</p>
          <h2 id="series-dialog-title">{series ? "管理重复系列" : "创建重复任务"}</h2>
        </div>
        <IconButton label="关闭重复任务面板" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <form
        className="form-stack"
        onKeyDown={(event) => {
          if ((event.nativeEvent.isComposing || event.keyCode === 229) && event.key === "Enter") {
            event.preventDefault()
          }
        }}
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <TaskRepeatFields
          draft={draft}
          onChange={(change) => {
            if (failedAttempt && series === null) setRequestId(crypto.randomUUID())
            setDraft((value) => ({ ...value, ...change }))
          }}
          startDateEditable={series === null}
        />
        <p className="setting-note">
          修改系列只影响此后尚未生成的任务；已生成、已完成和单次修改的实例保持原样。
        </p>
        {save.isError || pause.isError ? (
          <div className="conflict-feedback">
            <p className="inline-error" role="alert">
              {save.error?.message ?? pause.error?.message} 当前输入仍保留，请重新载入对照后再试。
            </p>
            {[save.error, pause.error].some(
              (error) => error instanceof ApiError && error.code === "SERIES_VERSION_CONFLICT",
            ) ? (
              <Button
                onClick={() => {
                  void invalidateTaskQueries(client)
                  onClose()
                }}
                size="compact"
                variant="secondary"
              >
                重新载入系列
              </Button>
            ) : null}
          </div>
        ) : null}
        <footer className="dialog__actions">
          {series ? (
            <Button loading={pause.isPending} onClick={() => pause.mutate()} variant="secondary">
              {series.status === "active" ? "暂停系列" : "恢复系列"}
            </Button>
          ) : null}
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button
            disabled={!draft.title.trim() || !draft.startDate}
            loading={save.isPending}
            type="submit"
          >
            <Repeat2 size={15} />
            {series ? "保存系列" : "创建系列"}
          </Button>
        </footer>
      </form>
    </DialogSurface>
  )
}

export function TaskSeriesDialog({
  onClose,
  open,
  seed = null,
  seriesId = null,
}: {
  readonly onClose: () => void
  readonly open: boolean
  readonly seed?: Item | null
  readonly seriesId?: string | null
}) {
  const series = useQuery({
    enabled: open && seriesId !== null,
    queryKey: ["task-series"],
    queryFn: () => apiRequest("/api/task-series", taskSeriesListSchema),
  })
  if (!open) return null
  if (seriesId !== null && series.isLoading) return null
  const selected = series.data?.find((entry) => entry.id === seriesId) ?? null
  if (seriesId !== null && selected === null) {
    return (
      <DialogSurface ariaLabel="管理重复系列" onClose={onClose}>
        <p className="inline-error" role="alert">
          无法载入这个重复系列，请稍后重试。
        </p>
        <Button onClick={onClose}>关闭</Button>
      </DialogSurface>
    )
  }
  return (
    <SeriesEditor key={selected?.id ?? "new"} onClose={onClose} seed={seed} series={selected} />
  )
}
