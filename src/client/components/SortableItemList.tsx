import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import type { ReactNode } from "react"
import type { Item } from "../../shared/items.js"

function SortableItem({ item, children }: { readonly item: Item; readonly children: ReactNode }) {
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
      {children}
    </div>
  )
}

export function SortableItemList({
  items,
  onReorder,
  renderItem,
}: {
  readonly items: readonly Item[]
  readonly onReorder: (itemIds: readonly string[]) => void
  readonly renderItem: (item: Item) => ReactNode
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const onDragEnd = (event: DragEndEvent) => {
    if (event.over === null || event.active.id === event.over.id) return
    const oldIndex = items.findIndex((item) => item.id === event.active.id)
    const newIndex = items.findIndex((item) => item.id === event.over?.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove([...items], oldIndex, newIndex).map((item) => item.id))
  }
  return (
    <DndContext onDragEnd={onDragEnd} sensors={sensors}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="list-stack">
          {items.map((item) => (
            <SortableItem item={item} key={item.id}>
              {renderItem(item)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
