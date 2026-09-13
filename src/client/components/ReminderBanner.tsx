import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Clock3, X } from "lucide-react"
import { useEffect } from "react"
import { MORNING_FOCUS_CLAUSE } from "../../shared/morningReminder.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { mirrorDueReminderToSystem } from "../lib/desktopNotify.js"
import { clearPendingSnooze, snoozeRequestId } from "../lib/notificationSnooze.js"
import { notificationsSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"
import { IconButton } from "./ui/IconButton.js"

type ReminderAction =
  | { readonly id: string; readonly action: "dismiss" }
  | { readonly id: string; readonly action: "snooze"; readonly requestId: string }

function ReminderDetail({ detail }: { readonly detail: string }) {
  const clauseStart = detail.indexOf(MORNING_FOCUS_CLAUSE)
  if (clauseStart === -1) return detail
  const before = detail.slice(0, clauseStart)
  const after = detail.slice(clauseStart + MORNING_FOCUS_CLAUSE.length)
  return (
    <>
      {before}
      <span className="reminder-banner__clause">{MORNING_FOCUS_CLAUSE}</span>
      {after}
    </>
  )
}

export function ReminderBanner() {
  const client = useQueryClient()
  const reminders = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest("/api/notifications", notificationsSchema),
    refetchInterval: 60_000,
  })
  const update = useMutation({
    mutationFn: (action: ReminderAction) => {
      switch (action.action) {
        case "snooze":
          return apiVoid(`/api/notifications/${action.id}/snooze`, {
            method: "POST",
            body: jsonBody({ minutes: 30, requestId: action.requestId }),
          })
        case "dismiss":
          return apiVoid(`/api/notifications/${action.id}/dismiss`, { method: "POST" })
      }
    },
    onSuccess: (_result, action) => {
      if (action.action === "snooze") clearPendingSnooze(action.id, action.requestId)
      return client.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
  const reminder = reminders.data?.[0]
  useEffect(() => {
    if (reminder === undefined) return
    void mirrorDueReminderToSystem(reminder)
  }, [reminder])
  if (reminder === undefined) return null
  return (
    <aside className="reminder-banner" role="status">
      <Bell aria-hidden="true" size={17} />
      <div>
        <strong>{reminder.title}</strong>
        <span>
          <ReminderDetail detail={reminder.detail} />
        </span>
        {update.isError && (
          <span className="inline-error" role="alert">
            操作结果未确认，请重试；延期会复用同一请求。
          </span>
        )}
      </div>
      <Button
        disabled={update.isPending}
        onClick={() =>
          update.mutate({ id: reminder.id, action: "snooze", requestId: snoozeRequestId(reminder) })
        }
        size="compact"
        variant="ghost"
      >
        <Clock3 size={15} />
        30 分钟后
      </Button>
      <IconButton
        disabled={update.isPending}
        label="今天不再提醒"
        onClick={() => update.mutate({ id: reminder.id, action: "dismiss" })}
      >
        <X size={17} />
      </IconButton>
    </aside>
  )
}
