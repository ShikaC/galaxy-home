import type { ButtonHTMLAttributes, ReactNode } from "react"

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string
  readonly children: ReactNode
}

export function IconButton({
  children,
  className = "",
  label,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className={`icon-button ${className}`.trim()}
      title={label}
      type={type}
    >
      {children}
    </button>
  )
}
