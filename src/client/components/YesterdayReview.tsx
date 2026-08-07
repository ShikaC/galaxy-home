import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, ArrowRight, Inbox, ListPlus, Sparkles } from "lucide-react"
import { apiRequest, apiVoid } from "../lib/api.js"
import { previousCalendarDate } from "../lib/date.js"
import { useItemStatusMutation, useTodayMutation } from "../lib/mutations.js"
import { itemsSchema } from "../lib/schemas.js"
import { useAppActions, useAppTime } from "./AppContext.js"
import { Button } from "./ui/Button.js"

export function YesterdayReview() {
  const client = useQueryClient()
  const actions = useAppActions()
  const { today: localToday } = useAppTime()
  const today = useTodayMutation()
  const status = useItemStatusMutation()
  const yesterday = previousCalendarDate(localToday)
  const items = useQuery({
    queryKey: ["items", "yesterday", yesterday],
    queryFn: () => apiRequest(`/api/items?view=today&localDate=${yesterday}`, itemsSchema),
  })
  const removeFromDay = useMutation({
    mutationFn: (id: string) =>
      apiVoid(`/api/items/${id}/today?localDate=${yesterday}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["items"] }),
  })
  const pending = items.data?.filter((item) => item.status === "active") ?? []
  if (pending.length === 0) return null
  return (
    <section aria-labelledby="yesterday-review-title" className="yesterday-review">
      <header>
        <div>
          <p className="eyebrow">昨日未完成</p>
          <h2 id="yesterday-review-title">重新决定这些事情的去向</h2>
        </div>
        <span>{pending.length} 项</span>
      </header>
      {pending.map((item) => (
        <article key={item.id}>
          <strong>{item.title}</strong>
          <div>
            <Button onClick={() => today.mutate({ id: item.id, focus: false })} size="compact">
              <ArrowRight size={14} /> 加入今天
            </Button>
            <Button
              onClick={() => today.mutate({ id: item.id, focus: false, secondary: true })}
              size="compact"
              variant="secondary"
            >
              <ListPlus size={14} /> 加入临时小事
            </Button>
            <Button
              onClick={() => removeFromDay.mutate(item.id)}
              size="compact"
              variant="secondary"
            >
              <Inbox size={14} /> 移回收集箱
            </Button>
            <Button
              onClick={() =>
                actions.openAi({
                  draft: `请帮我把「${item.title}」缩小成今天能完成的一小步，并更新这条待办的标题`,
                  focusItemId: item.id,
                })
              }
              size="compact"
              variant="ghost"
            >
              <Sparkles size={14} /> 请 AI 缩小
            </Button>
            <Button
              onClick={() => status.mutate({ id: item.id, status: "archived" })}
              size="compact"
              variant="ghost"
            >
              <Archive size={14} /> 放弃并归档
            </Button>
          </div>
        </article>
      ))}
      {today.isError ? <p className="inline-error">{today.error.message}</p> : null}
    </section>
  )
}
