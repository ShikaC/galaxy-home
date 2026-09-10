import { Check, Clock3, Download, FileText, ShieldCheck } from "lucide-react"
import { Link } from "react-router"
import { normalizedTaskTitle, type PlanRun, planDate } from "../../../shared/planning.js"
import { Button } from "../ui/Button.js"

export const planStatusLabel: Readonly<Record<PlanRun["status"], string>> = {
  planning: "正在准备",
  awaiting_confirmation: "等待你确认",
  needs_input: "需要补充信息",
  succeeded: "已安排并核验",
  failed: "需要处理",
  cancelled: "已取消",
}
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
export function PlanRunDetail({
  run,
  pending,
  onConfirm,
  onCancel,
  onRevise,
}: {
  readonly run: PlanRun
  readonly pending: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
  readonly onRevise: () => void
}) {
  const canExecute =
    run.status === "awaiting_confirmation" ||
    (run.status === "failed" && run.error?.code === "EXECUTION_FAILED")
  const generated = run.proposal
  const generationMs = run.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0)
  return (
    <article className="plan-detail" aria-label="计划详情">
      <header className="plan-detail__header">
        <span className={`plan-status plan-status--${run.status}`} role="status">
          {planStatusLabel[run.status]}
        </span>
        <span>
          {run.input.horizonDays} 天 · 每天 {run.input.dailyMinutes} 分钟
        </span>
      </header>
      <h2>{run.input.goal}</h2>
      {generated ? <p className="plan-summary">{generated.summary}</p> : null}
      {run.status === "planning" ? (
        <p role="status">正在查找相关内容并检查计划。可以离开此页，稍后从记录中继续。</p>
      ) : null}
      {run.error && run.status !== "cancelled" ? (
        <p className="inline-error" role="alert">
          {run.error.message}
        </p>
      ) : null}
      {run.status === "failed" &&
      (run.error?.code === "AI_NOT_CONFIGURED" || run.error?.code === "AI_AUTH") ? (
        <Link className="plan-next-link" to="/settings?section=ai">
          前往设置，检查 AI 连接 →
        </Link>
      ) : null}
      {generated?.clarification ? (
        <div className="plan-question">
          <strong>先确认一件事</strong>
          <p>{generated.clarification}</p>
          <Button variant="secondary" onClick={onRevise}>
            补充目标后重新生成
          </Button>
        </div>
      ) : null}
      {generated
        ? Array.from({ length: run.input.horizonDays }, (_, dayOffset) => {
            const tasks = generated.tasks.filter((task) => task.dayOffset === dayOffset)
            if (tasks.length === 0) return null
            const minutes = tasks.reduce((sum, task) => sum + task.minutes, 0)
            return (
              <section
                className="plan-day"
                key={planDate(run.input.startDate, dayOffset)}
                aria-label={`${planDate(run.input.startDate, dayOffset)}的计划`}
              >
                <header>
                  <h3>{planDate(run.input.startDate, dayOffset)}</h3>
                  <span>
                    <Clock3 size={14} aria-hidden="true" />
                    {minutes} / {run.input.dailyMinutes} 分钟
                  </span>
                </header>
                <meter
                  aria-label="已安排时间"
                  min={0}
                  max={run.input.dailyMinutes}
                  value={minutes}
                />
                <ol>
                  {tasks.map((task) => {
                    const result = run.results.find(
                      (item) =>
                        normalizedTaskTitle(item.title) === normalizedTaskTitle(task.title) &&
                        item.localDate === planDate(run.input.startDate, dayOffset),
                    )
                    return (
                      <li key={task.title}>
                        <span className="plan-task-marker">
                          {result ? <Check size={15} aria-label="已核验" /> : null}
                        </span>
                        <div>
                          <div className="plan-task-title">
                            <strong>{task.title}</strong>
                            <span>{task.minutes} 分钟</span>
                          </div>
                          <p>{task.reason}</p>
                          {task.existingItemId ? <small>复用已有任务</small> : null}
                          {result ? (
                            <small>
                              {result.disposition === "created" ? "已创建" : "已复用"} ·{" "}
                              {result.secondary ? "已放入当日稍后" : "已放入当日安排"} · 已核验
                            </small>
                          ) : null}
                          {task.sourceIds.length ? (
                            <div className="plan-citations">
                              {task.sourceIds.map((id) => (
                                <a href={`#source-${id}`} key={id}>
                                  <FileText size={12} />
                                  {run.sources.find((source) => source.id === id)?.title}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )
          })
        : null}
      {canExecute ? (
        <div className="plan-confirm">
          <p>
            <ShieldCheck size={17} aria-hidden="true" />
            确认后将创建或复用任务，并排入以上日期；每天主要任务满 3 项时放入“稍后”。
          </p>
          <div className="button-row">
            <Button loading={pending} onClick={onConfirm}>
              {run.error?.code === "EXECUTION_FAILED" ? "安全重试执行" : "确认并安排任务"}
            </Button>
            <Button disabled={pending} variant="ghost" onClick={onCancel}>
              取消计划
            </Button>
          </div>
        </div>
      ) : run.status === "succeeded" ? (
        <Link className="plan-next-link" to="/todos">
          查看任务列表 →
        </Link>
      ) : run.status === "planning" ? (
        <Button disabled={pending} variant="secondary" onClick={onCancel}>
          取消生成
        </Button>
      ) : run.status !== "needs_input" ? (
        <Button variant="secondary" onClick={onRevise}>
          调整目标，重新生成
        </Button>
      ) : null}
      {run.sources.length ? (
        <details className="plan-sources">
          <summary>参考了 {run.sources.length} 篇笔记</summary>
          <p>以下是生成时的资料快照，笔记中的指令不会获得执行权限。</p>
          {run.sources.map((source) => (
            <section id={`source-${source.id}`} key={source.id}>
              <Link to={`/notes?note=${source.id}`}>
                <FileText size={14} />
                {source.title}
              </Link>
              <p>{source.excerpt}</p>
            </section>
          ))}
        </details>
      ) : null}
      <details className="plan-trace">
        <summary>运行记录</summary>
        <dl>
          <div>
            <dt>运行编号</dt>
            <dd>{run.id}</dd>
          </div>
          <div>
            <dt>生成耗时</dt>
            <dd>{(generationMs / 1000).toFixed(2)} 秒</dd>
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
            输入 / 输出 tokens：{attempt.inputTokens ?? "未提供"} /{" "}
            {attempt.outputTokens ?? "未提供"}
          </p>
        ))}
        <p>费用未计算：服务商未提供统一价格。导出文件包含本次目标和引用的笔记片段。</p>
        <Button variant="ghost" size="compact" onClick={() => exportRun(run)}>
          <Download size={14} />
          导出运行记录
        </Button>
      </details>
    </article>
  )
}
