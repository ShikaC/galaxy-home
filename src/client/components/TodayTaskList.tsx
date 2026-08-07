import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import type { Item } from "../../shared/items.js"
import { apiVoid, jsonBody } from "../lib/api.js"
import { useItemStatusMutation, useTodayMutation } from "../lib/mutations.js"
import { useAppTime } from "./AppContext.js"
import { TaskRow } from "./TaskRow.js"

function SortableTask({ item, onEdit }: { readonly item: Item; readonly onEdit?: (item: Item) => void }) {
  const status = useItemStatusMutation()
  const today = useTodayMutation()
  const sortable = useSortable({ id: item.id })
  return (
    <div
      className="sortable-task"
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      <button
        aria-label={`拖动 ${item.title} 排序`}
        className="drag-handle"
        {...sortable.attributes}
        {...sortable.listeners}
        type="button"
      >
        <GripVertical size={17} />
      </button>
      <TaskRow
        item={item}
        onComplete={() =>
          status.mutate({
            id: item.id,
            status: item.status === "completed" ? "active" : "completed",
          })
        }
        onFocus={item.isSecondary ? undefined : () => today.mutate({ id: item.id, focus: true })}
        onEdit={onEdit === undefined ? undefined : () => onEdit(item)}
      />
    </div>
  )
}

export function TodayTaskList({
  items,
  onEdit,
  onReordered,
}: {
  readonly items: readonly Item[]
  readonly onEdit?: (item: Item) => void
  readonly onReordered: () => void
}) {
  const { today } = useAppTime()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const onDragEnd = (event: DragEndEvent) => {
    if (event.over === null || event.active.id === event.over.id) return
    const oldIndex = items.findIndex((item) => item.id === event.active.id)
    const newIndex = items.findIndex((item) => item.id === event.over?.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove([...items], oldIndex, newIndex)
    void apiVoid("/api/today/reorder", {
      method: "PUT",
      body: jsonBody({ localDate: today, itemIds: reordered.map((item) => item.id) }),
    }).then(onReordered)
  }
  return (
    <DndContext onDragEnd={onDragEnd} sensors={sensors}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="list-stack">
          {items.map((item) => (
            <SortableTask
              item={item}
              key={item.id}
              {...(onEdit === undefined ? {} : { onEdit })}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
