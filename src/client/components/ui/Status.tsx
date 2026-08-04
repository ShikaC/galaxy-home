import type { ReactNode } from "react"

export type BadgeTone = "neutral" | "positive" | "attention" | "waiting"

export function Badge({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode
  readonly tone?: BadgeTone
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function ProgressBar({ label, value }: { readonly label: string; readonly value: number }) {
  const boundedValue = Math.max(0, Math.min(100, value))
  return (
    <div className="progress">
      <div className="progress__labels">
        <span>{label}</span>
        <span>{boundedValue}%</span>
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={boundedValue}
        className="progress__track"
        role="progressbar"
      >
        <span className="progress__value" style={{ inlineSize: `${boundedValue}%` }} />
      </div>
    </div>
  )
}
