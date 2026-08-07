import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { PendingChatAction } from "../../shared/aiChatActions.js"
import { aiMessageSchema } from "../../shared/ai.js"
import { Button } from "./ui/Button.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { z } from "zod"

const confirmResponseSchema = z.object({
  message: aiMessageSchema,
  confirmation: z.string(),
})

export function AiPendingActionCard({
  messageId,
  pendingAction,
  onUpdated,
}: {
  readonly messageId: string
  readonly pendingAction: PendingChatAction
  readonly onUpdated: (message: z.infer<typeof aiMessageSchema>, confirmation?: string) => void
}) {
  const client = useQueryClient()
  const confirm = useMutation({
    mutationFn: () =>
      apiRequest(`/api/ai/messages/${messageId}/confirm-action`, confirmResponseSchema, {
        method: "POST",
        body: jsonBody({}),
      }),
    onSuccess: (data) => {
      onUpdated(data.message, data.confirmation)
      void client.invalidateQueries({ queryKey: queryKeys.meta })
      void client.invalidateQueries({ queryKey: ["items"] })
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: ["projects"] })
    },
  })
  const reject = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/ai/messages/${messageId}/reject-action`,
        z.object({ message: aiMessageSchema }),
        { method: "POST", body: jsonBody({}) },
      ),
    onSuccess: (data) => onUpdated(data.message),
  })
  if (pendingAction.status !== "pending") {
    return (
      <p className="ai-pending-action ai-pending-action--done">
        {pendingAction.status === "confirmed" ? "已确认执行" : "已取消"}：{pendingAction.summary}
      </p>
    )
  }
  return (
    <div className="ai-pending-action">
      <p>待确认：{pendingAction.summary}</p>
      <div className="button-row">
        <Button loading={confirm.isPending} onClick={() => confirm.mutate()} size="compact">
          确认执行
        </Button>
        <Button
          loading={reject.isPending}
          onClick={() => reject.mutate()}
          size="compact"
          variant="secondary"
        >
          取消
        </Button>
      </div>
      {confirm.isError || reject.isError ? (
        <p className="inline-error">{confirm.error?.message ?? reject.error?.message}</p>
      ) : null}
    </div>
  )
}
