import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react"
import { forwardRef, useId } from "react"

type FieldChrome = {
  readonly label: string
  readonly hint?: string
  readonly error?: string
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & FieldChrome

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className = "", error, hint, id, label, ...props },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const descriptionId =
    error !== undefined || hint !== undefined ? `${fieldId}-description` : undefined

  return (
    <label className="field" htmlFor={fieldId}>
      <span className="field__label">{label}</span>
      <input
        {...props}
        aria-describedby={descriptionId}
        aria-invalid={error !== undefined}
        className={`field__control ${className}`.trim()}
        id={fieldId}
        ref={ref}
      />
      {error !== undefined ? (
        <span className="field__error" id={descriptionId}>
          {error}
        </span>
      ) : hint !== undefined ? (
        <span className="field__hint" id={descriptionId}>
          {hint}
        </span>
      ) : null}
    </label>
  )
})

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className = "", error, hint, id, label, ...props },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const descriptionId =
    error !== undefined || hint !== undefined ? `${fieldId}-description` : undefined

  return (
    <label className="field" htmlFor={fieldId}>
      <span className="field__label">{label}</span>
      <textarea
        {...props}
        aria-describedby={descriptionId}
        aria-invalid={error !== undefined}
        className={`field__control field__control--area ${className}`.trim()}
        id={fieldId}
        ref={ref}
      />
      {error !== undefined ? (
        <span className="field__error" id={descriptionId}>
          {error}
        </span>
      ) : hint !== undefined ? (
        <span className="field__hint" id={descriptionId}>
          {hint}
        </span>
      ) : null}
    </label>
  )
})
