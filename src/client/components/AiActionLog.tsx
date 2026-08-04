import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RotateCcw } from "lucide-react"
import { aiActionsSchema } from "../../shared/ai.js"
import { apiRequest, apiVoid } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { IconButton } from "./ui/IconButton.js"

export function AiActionLog() {
  const client = useQueryClient()
  const actions = useQuery({
    queryKey: ["ai-actions"],
    queryFn: () => apiRequest("/api/ai/actions", aiActionsSchema),
  })
  const undo = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/ai/actions/${id}/undo`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["ai-actions"] })
      void client.invalidateQueries({ queryKey: queryKeys.reviews })
      void client.invalidateQueries({ queryKey: queryKeys.projects })
      void client.invalidateQueries({ queryKey: ["project-ai"] })
    },
  })
  return (
    <div className="subsection">
      <h3>AI 操作记录</h3>
      {actions.data?.length === 0 ? <p className="setting-note">还没有 AI 自动操作。</p> : null}
      <div className="ai-action-list">
        {actions.data?.map((action) => (
          <article key={action.id}>
            <div>
              <strong>{action.reason}</strong>
              <span>{new Date(action.createdAt).toLocaleString("zh-CN")}</span>
            </div>
            {action.undoneAt === null ? (
              <IconButton label="撤销 AI 操作" onClick={() => undo.mutate(action.id)}>
                <RotateCcw size={16} />
              </IconButton>
            ) : (
              <span>已撤销</span>
            )}
          </article>
        ))}
      </div>
      {undo.isError ? <p className="inline-error">{undo.error.message}</p> : null}
    </div>
  )
}
