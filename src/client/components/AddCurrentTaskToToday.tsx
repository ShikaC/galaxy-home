import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarPlus, Check } from "lucide-react"
import { apiRequest, jsonBody } from "../lib/api.js"
import { itemSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"

export function AddCurrentTaskToToday({
  disabled,
  localDate,
  projectId,
  taskTitle,
}: {
  readonly disabled: boolean
  readonly localDate: string
  readonly projectId: string
  readonly taskTitle: string
}) {
  const client = useQueryClient()
  const add = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${projectId}/current-task/today`, itemSchema, {
        method: "POST",
        body: jsonBody({ localDate }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["items"] }),
  })
  const added = add.isSuccess && add.data.title === taskTitle
  const label = added ? (add.data.isSecondary ? "已加入临时小事" : "已加入今日") : "加入今日"
  return (
    <div className="current-task">
      <div className="current-task__header">
        <span className="project-section-label">当前任务</span>
        <Button
          disabled={disabled || added}
          loading={add.isPending}
          onClick={() => add.mutate()}
          size="compact"
          variant="secondary"
        >
          {added ? <Check size={14} /> : <CalendarPlus size={14} />}
          {label}
        </Button>
      </div>
      <strong>{taskTitle}</strong>
      {add.isError ? <p className="inline-error">{add.error.message}</p> : null}
    </div>
  )
}
