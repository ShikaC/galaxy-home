import { Download } from "lucide-react"
import type { PlanRun } from "../../../shared/planning.js"
import { Button } from "../ui/Button.js"

function exportRun(run: PlanRun): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `galaxy-plan-${run.id}.json`
  link.click()
  URL.revokeObjectURL(url)
}
export function PlanRunTrace({ run }: { readonly run: PlanRun }) {
  const generationMs = run.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0)
  return (
    <details className="plan-trace">
      <summary>运行记录</summary>
      <dl>
        <div>
          <dt>运行编号</dt>
          <dd>{run.id}</dd>
        </div>
        <div>
          <dt>生成耗时</dt>
          <dd>
            {run.attempts.length ? `${(generationMs / 1000).toFixed(2)} 秒` : "尚无完整响应记录"}
          </dd>
        </div>
        <div>
          <dt>执行耗时</dt>
          <dd>{run.executionMs === null ? "尚未执行" : `${run.executionMs} ms`}</dd>
        </div>
        <div>
          <dt>规划版本</dt>
          <dd>{run.promptVersion}</dd>
        </div>
        <div>
          <dt>检索版本</dt>
          <dd>{run.retrievalVersion}</dd>
        </div>
      </dl>
      {run.attempts.map((attempt) => (
        <p key={attempt.number}>
          第 {attempt.number} 次 · {attempt.model ?? "模型未响应"} ·{" "}
          {attempt.outcome === "accepted"
            ? "通过检查"
            : attempt.outcome === "invalid"
              ? "格式或约束未通过"
              : "请求失败"}
          <br />
          输入 / 输出 tokens：{attempt.inputTokens ?? "未提供"} / {attempt.outputTokens ?? "未提供"}
        </p>
      ))}
      <p>费用未计算：服务商未提供统一价格。导出文件包含本次目标和引用的笔记片段。</p>
      <Button variant="ghost" size="compact" onClick={() => exportRun(run)}>
        <Download size={14} />
        导出运行记录
      </Button>
    </details>
  )
}
