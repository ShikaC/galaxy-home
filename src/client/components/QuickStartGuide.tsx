import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Inbox, X } from "lucide-react"
import { apiVoid } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { useAppActions } from "./AppContext.js"
import { Button } from "./ui/Button.js"
import { IconButton } from "./ui/IconButton.js"

export function QuickStartGuide() {
  const actions = useAppActions()
  const client = useQueryClient()
  const dismiss = useMutation({
    mutationFn: () => apiVoid("/api/tutorial/dismiss", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  return (
    <aside aria-label="开始使用" className="quick-start-guide">
      <Inbox size={17} />
      <p>先随手记一件事。空间会跟着你的记录慢慢长出来。</p>
      <Button onClick={actions.openCapture} size="compact" type="button">
        随手记
      </Button>
      <IconButton label="关闭使用引导" onClick={() => dismiss.mutate()}>
        <X size={17} />
      </IconButton>
    </aside>
  )
}
