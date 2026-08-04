import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspaceSettingsSchema } from "../../shared/settings.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

export function AiPermissionControl() {
  const meta = useMeta()
  const client = useQueryClient()
  const permission = useMutation({
    mutationFn: (aiPermission: "conservative" | "open") =>
      apiRequest("/api/settings", workspaceSettingsSchema, {
        method: "PATCH",
        body: jsonBody({ aiPermission }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  return (
    <fieldset aria-label="AI 权限模式" className="drawer__permission">
      <button
        aria-pressed={meta.data?.settings.aiPermission === "conservative"}
        onClick={() => permission.mutate("conservative")}
        type="button"
      >
        保守
      </button>
      <button
        aria-pressed={meta.data?.settings.aiPermission === "open"}
        onClick={() => permission.mutate("open")}
        type="button"
      >
        开放
      </button>
    </fieldset>
  )
}
