import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Inbox, Sparkles, X } from "lucide-react"
import { apiVoid } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { IconButton } from "./ui/IconButton.js"

export function QuickStartGuide() {
  const client = useQueryClient()
  const dismiss = useMutation({
    mutationFn: () => apiVoid("/api/tutorial/dismiss", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  return (
    <aside aria-label="开始使用" className="quick-start-guide">
      <div>
        <Inbox size={17} />
        <span>
          <strong>先收集</strong> 随时记下一件事
        </span>
      </div>
      <div>
        <Sparkles size={17} />
        <span>
          <strong>再整理</strong> 放进今天、<span className="text-phrase">分类或项目</span>
        </span>
      </div>
      <div>
        <CheckCircle2 size={17} />
        <span>
          <strong>留痕迹</strong> 完成后记一条收获
        </span>
      </div>
      <IconButton label="关闭使用引导" onClick={() => dismiss.mutate()}>
        <X size={17} />
      </IconButton>
    </aside>
  )
}
