import type { ReactNode } from "react"

export function Toast({
  children,
  tone = "confirmation",
}: {
  readonly children: ReactNode
  readonly tone?: "confirmation" | "error"
}) {
  return (
    <div className={`toast toast--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  )
}

export function Skeleton({ label = "内容加载中" }: { readonly label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="skeleton" role="status">
      <span className="skeleton__mark" />
      <span className="skeleton__copy">
        <span />
        <span />
      </span>
    </div>
  )
}
