import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Heart,
  Home,
  type LucideIcon,
  Pencil,
  Plus,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import { useState } from "react"
import type { Category } from "../../shared/items.js"
import { categorySchema } from "../../shared/items.js"
import { Button } from "../components/ui/Button.js"
import { IconButton } from "../components/ui/IconButton.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

const ICONS: readonly {
  readonly value: string
  readonly label: string
  readonly icon: LucideIcon
}[] = [
  { value: "tag", label: "标签", icon: Tag },
  { value: "home", label: "居家", icon: Home },
  { value: "briefcase", label: "工作", icon: BriefcaseBusiness },
  { value: "heart", label: "关怀", icon: Heart },
  { value: "book", label: "学习", icon: BookOpen },
  { value: "star", label: "重点", icon: Star },
]

function iconFor(value: string): LucideIcon {
  return ICONS.find((option) => option.value === value)?.icon ?? Tag
}

export function CategorySettings() {
  const meta = useMeta()
  const client = useQueryClient()
  const [name, setName] = useState("")
  const [color, setColor] = useState("#26734d")
  const [icon, setIcon] = useState("tag")
  const [editing, setEditing] = useState<Category | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.meta })
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/categories", categorySchema, {
        method: "POST",
        body: jsonBody({ name, color, icon }),
      }),
    onSuccess: () => {
      setName("")
      void refresh()
    },
  })
  const update = useMutation({
    mutationFn: (category: Category) =>
      apiRequest(`/api/categories/${category.id}`, categorySchema, {
        method: "PATCH",
        body: jsonBody({ name: category.name, color: category.color, icon: category.icon }),
      }),
    onSuccess: () => {
      setEditing(null)
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void refresh()
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  const move = async (index: number, delta: number) => {
    const categories = [...(meta.data?.categories ?? [])]
    const targetIndex = index + delta
    const current = categories[index]
    const target = categories[targetIndex]
    if (current === undefined || target === undefined) return
    categories[index] = target
    categories[targetIndex] = current
    await apiVoid("/api/categories/reorder", {
      method: "PUT",
      body: jsonBody({ categoryIds: categories.map((category) => category.id) }),
    })
    await refresh()
  }
  return (
    <div>
      <h3>自定义分类</h3>
      <form
        className="inline-create category-create"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <input
          aria-label="分类颜色"
          onChange={(event) => setColor(event.target.value)}
          type="color"
          value={color}
        />
        <input
          aria-label="分类名称"
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：家务"
          value={name}
        />
        <select
          aria-label="分类图标"
          onChange={(event) => setIcon(event.target.value)}
          value={icon}
        >
          {ICONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button disabled={!name.trim()} size="compact" type="submit">
          <Plus size={15} />
          添加
        </Button>
      </form>
      <div className="settings-list">
        {meta.data?.categories.map((category, index) => {
          const Icon = iconFor(category.icon)
          const isEditing = editing?.id === category.id
          return (
            <div key={category.id}>
              {isEditing && editing !== null ? (
                <>
                  <input
                    aria-label="编辑分类颜色"
                    onChange={(event) => setEditing({ ...editing, color: event.target.value })}
                    type="color"
                    value={editing.color}
                  />
                  <input
                    aria-label="编辑分类名称"
                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                    value={editing.name}
                  />
                  <select
                    aria-label="编辑分类图标"
                    onChange={(event) => setEditing({ ...editing, icon: event.target.value })}
                    value={editing.icon}
                  >
                    {ICONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <IconButton label="保存分类" onClick={() => update.mutate(editing)}>
                    <Check size={15} />
                  </IconButton>
                  <IconButton label="取消编辑" onClick={() => setEditing(null)}>
                    <X size={15} />
                  </IconButton>
                </>
              ) : (
                <>
                  <span className="category-symbol" style={{ color: category.color }}>
                    <Icon size={16} />
                  </span>
                  <strong>{category.name}</strong>
                  <IconButton label="编辑分类" onClick={() => setEditing(category)}>
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton
                    disabled={index === 0}
                    label="上移分类"
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUp size={15} />
                  </IconButton>
                  <IconButton
                    disabled={index === (meta.data?.categories.length ?? 0) - 1}
                    label="下移分类"
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDown size={15} />
                  </IconButton>
                  <IconButton label="删除分类" onClick={() => remove.mutate(category.id)}>
                    <Trash2 size={15} />
                  </IconButton>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
