import { RefreshCw } from "lucide-react"
import { Button } from "./Button.js"
import { Skeleton } from "./Feedback.js"

export function QueryFeedback({
  pending,
  error,
  retry,
  label,
}: {
  readonly pending: boolean
  readonly error: Error | null
  readonly retry: () => void
  readonly label?: string
}) {
  if (error !== null)
    return (
      <div className="query-feedback query-feedback--error" role="alert">
        <p>{error.message}</p>
        <Button onClick={retry} size="compact" variant="secondary">
          <RefreshCw aria-hidden="true" size={14} />
          重新加载
        </Button>
      </div>
    )
  if (!pending) return null
  return <Skeleton {...(label === undefined ? {} : { label })} />
}
