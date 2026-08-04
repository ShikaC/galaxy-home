import { LoaderCircle } from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly children: ReactNode
  readonly loading?: boolean
  readonly variant?: "primary" | "secondary" | "ghost" | "danger"
  readonly size?: "compact" | "regular"
}

export function Button({
  children,
  className = "",
  disabled = false,
  loading = false,
  size = "regular",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading}
      className={`button button--${variant} button--${size} ${className}`.trim()}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="button__loader" size={16} /> : null}
      <span>{children}</span>
    </button>
  )
}
