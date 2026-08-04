import type { ReactNode } from "react"

export function PageHeader({
  actions,
  eyebrow,
  subtitle,
  title,
}: {
  readonly actions?: ReactNode
  readonly eyebrow?: string
  readonly subtitle?: string
  readonly title: string
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  )
}

export function SectionHeader({
  action,
  title,
}: {
  readonly action?: ReactNode
  readonly title: string
}) {
  return (
    <header className="section-header">
      <h2>{title}</h2>
      {action}
    </header>
  )
}
