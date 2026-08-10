import { LoaderCircle } from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string
  readonly children: ReactNode
  readonly loading?: boolean
}

export function IconButton({
  children,
  className = "",
  disabled = false,
  label,
  loading = false,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading}
      aria-label={label}
      className={`icon-button ${className}`.trim()}
      disabled={disabled || loading}
      title={label}
      type={type}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="icon-button__loader" size={16} />
      ) : (
        children
      )}
    </button>
  )
}
