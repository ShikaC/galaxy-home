import { RefreshCw } from "lucide-react"
import { isRouteErrorResponse, useRouteError } from "react-router"
import { Button } from "./ui/Button.js"

function errorDetail(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim()
  if (error instanceof Error && error.message !== "") return error.message
  return "未能读取错误详情"
}

export function RouteErrorPage() {
  const error = useRouteError()
  return (
    <main className="route-error" role="alert">
      <p className="eyebrow">银河居所</p>
      <h1>页面暂时无法打开</h1>
      <p>本地数据仍然保留。重新加载后可以继续。</p>
      <Button onClick={() => window.location.reload()}>
        <RefreshCw size={16} />
        重新加载
      </Button>
      <details>
        <summary>错误详情</summary>
        <code>{errorDetail(error)}</code>
      </details>
    </main>
  )
}
