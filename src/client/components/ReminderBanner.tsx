import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Clock3, X } from "lucide-react"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { notificationsSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"
import { IconButton } from "./ui/IconButton.js"

export function ReminderBanner() {
  const client = useQueryClient()
  const reminders = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest("/api/notifications", notificationsSchema),
    refetchInterval: 60_000,
  })
  const update = useMutation({
    mutationFn: ({ id, action }: { readonly id: string; readonly action: "snooze" | "dismiss" }) =>
      action === "snooze"
        ? apiVoid(`/api/notifications/${id}/snooze`, {
            method: "POST",
            body: jsonBody({ minutes: 30 }),
          })
        : apiVoid(`/api/notifications/${id}/dismiss`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  })
  const reminder = reminders.data?.[0]
  if (reminder === undefined) return null
  return (
    <aside className="reminder-banner" role="status">
      <Bell size={17} />
      <div>
        <strong>{reminder.title}</strong>
        <span>{reminder.detail}</span>
      </div>
      <Button
        onClick={() => update.mutate({ id: reminder.id, action: "snooze" })}
        size="compact"
        variant="ghost"
      >
        <Clock3 size={15} />
        30 分钟后
      </Button>
      <IconButton
        label="今天不再提醒"
        onClick={() => update.mutate({ id: reminder.id, action: "dismiss" })}
      >
        <X size={17} />
      </IconButton>
    </aside>
  )
}
