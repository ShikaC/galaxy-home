import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, CheckSquare2 } from "lucide-react"
import { Link } from "react-router"
import type { Item } from "../../shared/items.js"
import { useItemStatusMutation } from "../lib/mutations.js"
import { todayEmptyCopy } from "../lib/todayBoard.js"
import { useAppActions } from "./AppContext.js"
import { SectionHeader } from "./PageHeader.js"
import { TaskRow } from "./TaskRow.js"
import { TodayTaskList } from "./TodayTaskList.js"
import { Button } from "./ui/Button.js"
import { EmptyState } from "./ui/EmptyState.js"

export function HomeTodaySection({
  lists,
  onCompleted,
  onEdit,
}: {
  readonly lists: {
    readonly completed: readonly Item[]
    readonly primary: readonly Item[]
    readonly secondary: readonly Item[]
  }
  readonly onCompleted: (item: Item) => void
  readonly onEdit: (item: Item) => void
}) {
  const actions = useAppActions()
  const client = useQueryClient()
  const itemStatus = useItemStatusMutation((item, change) => {
    if (change.status === "completed") onCompleted(item)
  })
  const empty = todayEmptyCopy({
    completedCount: lists.completed.length,
    secondaryCount: lists.secondary.length,
  })
  return (
    <section className="section-band">
      <SectionHeader
        action={
          <Link className="text-action" to="/todos">
            整理待办 <ArrowRight size={15} />
          </Link>
        }
        title="今日待办"
      />
      {lists.primary.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={actions.openCapture} size="compact">
              随手记
            </Button>
          }
          description={empty.description}
          icon={CheckSquare2}
          title={empty.title}
        />
      ) : (
        <TodayTaskList
          items={lists.primary}
          onCompleted={onCompleted}
          onEdit={onEdit}
          onReordered={() => void client.invalidateQueries({ queryKey: ["items"] })}
        />
      )}
      {lists.secondary.length > 0 ? (
        <details className="secondary-fold" open>
          <summary>临时小事 {lists.secondary.length} 项</summary>
          {lists.secondary.map((item) => (
            <TaskRow
              item={item}
              key={item.id}
              onComplete={() =>
                itemStatus.mutate({
                  id: item.id,
                  expectedVersion: item.version,
                  status: "completed",
                })
              }
              onEdit={() => onEdit(item)}
            />
          ))}
        </details>
      ) : null}
      {lists.completed.length > 0 ? (
        <details className="completed-fold">
          <summary>今日已完成 {lists.completed.length} 项</summary>
          {lists.completed.map((item) => (
            <TaskRow
              item={item}
              key={item.id}
              onComplete={() =>
                itemStatus.mutate({
                  id: item.id,
                  expectedVersion: item.version,
                  status: "active",
                })
              }
              onEdit={() => onEdit(item)}
            />
          ))}
        </details>
      ) : null}
    </section>
  )
}
