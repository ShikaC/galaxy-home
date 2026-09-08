import type { ReactNode } from "react"

export function FormDisclosure({
  children,
  summary,
}: {
  readonly children: ReactNode
  readonly summary: string
}) {
  return (
    <details className="form-disclosure">
      <summary>{summary}</summary>
      {children}
    </details>
  )
}
