import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  BookOpen,
  BriefcaseBusiness,
  Heart,
  Home,
  type LucideIcon,
  Star,
  Tag,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { categorySchema } from "../../shared/items.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { Button } from "./ui/Button.js"
import { TextField } from "./ui/Field.js"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"

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

function defaultCategoryColor(): string {
  const color = window.getComputedStyle(document.documentElement).getPropertyValue("--color-action")
  if (color.trim() === "") throw new Error("缺少分类默认颜色设计令牌")
  return color.trim()
}

export function CategoryDialog({
  onClose,
  onCreated,
  open,
}: {
  readonly onClose: () => void
  readonly onCreated?: (categoryId: string) => void
  readonly open: boolean
}) {
  const client = useQueryClient()
  const [name, setName] = useState("")
  const [color, setColor] = useState("#26734d")
  const [icon, setIcon] = useState("tag")
  useEffect(() => {
    if (!open) return
    setName("")
    setColor(defaultCategoryColor())
    setIcon("tag")
  }, [open])
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/categories", categorySchema, {
        method: "POST",
        body: jsonBody({ name, color, icon }),
      }),
    onSuccess: (category) => {
      void client.invalidateQueries({ queryKey: queryKeys.meta })
      onCreated?.(category.id)
      onClose()
    },
  })
  if (!open) return null
  return (
    <DialogSurface ariaLabelledBy="new-category-title" onClose={onClose}>
      <header className="dialog__header">
        <div>
          <p className="eyebrow">新分类</p>
          <h2 id="new-category-title">给待办找一个归处</h2>
        </div>
        <IconButton label="关闭分类创建" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <TextField
          autoFocus
          label="分类名称"
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：家务"
          value={name}
        />
        <label className="field">
          <span className="field__label">颜色</span>
          <input
            aria-label="分类颜色"
            className="field__control"
            onChange={(event) => setColor(event.target.value)}
            type="color"
            value={color}
          />
        </label>
        <label className="field">
          <span className="field__label">图标</span>
          <select
            aria-label="分类图标"
            className="field__control"
            onChange={(event) => setIcon(event.target.value)}
            value={icon}
          >
            {ICONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <Button disabled={!name.trim()} loading={create.isPending} type="submit">
            创建分类
          </Button>
          <Button onClick={onClose} type="button" variant="secondary">
            取消
          </Button>
        </div>
        {create.isError ? <p className="inline-error">{create.error.message}</p> : null}
      </form>
    </DialogSurface>
  )
}
