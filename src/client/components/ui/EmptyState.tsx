import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export function EmptyState({
  action,
  description,
  icon: Icon,
  title,
}: {
  readonly action?: ReactNode
  readonly description: ReactNode
  readonly icon: LucideIcon
  readonly title: string
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon aria-hidden="true" size={22} strokeWidth={1.75} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
