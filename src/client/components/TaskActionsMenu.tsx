import type { LucideIcon } from "lucide-react"
import { MoreHorizontal } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { IconButton } from "./ui/IconButton.js"

export type TaskAction = {
  readonly icon: LucideIcon
  readonly label: string
  readonly onSelect: () => void
  readonly opensDialog?: boolean
}

export function TaskActionsMenu({ actions }: { readonly actions: readonly TaskAction[] }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return
      setOpen(false)
      menuRef.current?.querySelector<HTMLButtonElement>(":scope > .icon-button")?.focus()
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div className="task-actions-menu" ref={menuRef}>
      <IconButton
        aria-expanded={open}
        aria-haspopup="menu"
        label="更多操作"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </IconButton>
      {open ? (
        <div aria-label="待办操作" className="task-actions-popover" role="menu">
          {actions.map((action) => {
            const ActionIcon = action.icon
            return (
              <button
                key={action.label}
                onClick={() => {
                  action.onSelect()
                  if (!action.opensDialog) setOpen(false)
                }}
                role="menuitem"
                type="button"
              >
                <ActionIcon aria-hidden="true" size={16} />
                <span>{action.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
