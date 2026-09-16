import { CheckCircle2, FileText, Pencil, RefreshCw, StopCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { z } from "zod"
import type { TaskPlanInput, TaskPlanRun } from "../../../shared/taskPlanning.js"
import { taskPlanInputText, taskPlanInputTitle } from "../../../shared/taskPlanning.js"
import { Button } from "../ui/Button.js"
import { TextArea } from "../ui/Field.js"
import { readDraft, writeDraft } from "./draftStorage.js"
import { TaskPlanManualCapture } from "./TaskPlanManualCapture.js"
import { TaskPlanProposalView } from "./TaskPlanProposalView.js"

export const taskPlanStatusLabel = {
  planning: "正在生成",
  awaiting_confirmation: "等待确认",
  needs_input: "需要补充",
  succeeded: "写入并核验完成",
  failed: "生成失败",
  cancelled: "已取消",
} as const

export function TaskPlanningRunDetail({
  onCancel,
  onConfirm,
  onEdit,
  onRetry,
  onRefresh,
  today,
  pending,
  run,
}: {
  readonly today: string
  readonly onRefresh: () => void
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly onEdit: () => void
  readonly onRetry: (input: TaskPlanInput) => void
  readonly pending: boolean
  readonly run: TaskPlanRun
}) {
  const answerKey = `galaxy-task-plan-answer:${run.id}`
  const sourcesRef = useRef<HTMLDetailsElement>(null)
  const [answer, setAnswer] = useState(() => readDraft(answerKey, z.string()) ?? "")
  const retryRequest = useRef({ identity: "", id: crypto.randomUUID() })
  useEffect(() => {
    writeDraft(answerKey, answer)
  }, [answerKey, answer])
  const retryWith = (text: string) => {
    const identity = JSON.stringify({ runId: run.id, text })
    if (retryRequest.current.identity !== identity)
      retryRequest.current = { identity, id: crypto.randomUUID() }
    const requestId = retryRequest.current.id
    onRetry(
      run.input.type === "plan"
        ? { ...run.input, goal: text, requestId }
        : { ...run.input, originalText: text, requestId },
    )
  }
  const blocking =
    run.proposal?.kind === "replan" &&
    run.proposal.unresolvedConflicts.some((conflict) => conflict.blocking)
  const canConfirm = run.status === "awaiting_confirmation" && run.proposal !== null && !blocking
  const retry = () => {
    retryWith(`${taskPlanInputText(run.input)}\n\n补充说明：${answer.trim()}`)
  }
  return (
    <article className="task-planning-run" aria-label="计划详情">
      <header className="task-planning-run__header">
        <div>
          <p className="eyebrow">AI TASK PLAN</p>
          <h2>{taskPlanInputTitle(run.input)}</h2>
        </div>
        <span className={`task-plan-status task-plan-status--${run.status}`}>
          {taskPlanStatusLabel[run.status]}
        </span>
      </header>
      <details
        className="task-plan-original"
        open={run.status === "failed" || run.status === "cancelled"}
      >
        <summary>查看始终保留的原始输入</summary>
        <p>{taskPlanInputText(run.input)}</p>
      </details>
      {run.status === "planning" ? (
        <div className="task-plan-waiting" role="status">
          <RefreshCw size={20} />
          <div>
            <strong>正在读取并校验真实数据</strong>
            <p>可以离开此页；运行记录会保存，稍后重新打开仍能继续。</p>
          </div>
        </div>
      ) : null}
      {run.error ? (
        <div className="task-plan-run-error" role="alert">
          <strong>{run.error.message}</strong>
          <p>
            原始输入已保留。
            {run.error.retryable ? (
              <>
                可补充说明，或<span className="task-plan-token">直接重试。</span>
              </>
            ) : (
              <>
                调整输入后<span className="task-plan-token">新建运行。</span>
              </>
            )}
          </p>
        </div>
      ) : null}
      {run.baseSnapshot ? (
        <p className="task-plan-snapshot">
          {run.baseSnapshot.startDate} 至 {run.baseSnapshot.endDate}（不含）·{" "}
          {run.baseSnapshot.timezone} · 空闲{" "}
          {run.baseSnapshot.freeSlots.reduce((sum, slot) => sum + slot.minutes, 0)} 分钟
        </p>
      ) : null}
      {run.proposal ? (
        <TaskPlanProposalView
          proposal={run.proposal}
          snapshot={run.baseSnapshot}
          onCite={() => {
            if (sourcesRef.current) sourcesRef.current.open = true
          }}
        />
      ) : null}
      {run.sources.length ? (
        <details className="plan-sources" ref={sourcesRef}>
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
      {run.status === "needs_input" ? (
        <section className="task-plan-ambiguity">
          <h3>回答后重新识别</h3>
          <p>你的回答会作为补充说明加入新运行，原始输入会一并保留。</p>
          <TextArea
            label="补充说明"
            value={answer}
            rows={3}
            required
            onChange={(event) => setAnswer(event.target.value)}
          />
          <Button disabled={answer.trim() === ""} loading={pending} onClick={retry}>
            提交说明并重试
          </Button>
        </section>
      ) : null}
      {run.status === "succeeded" ? (
        <section className="task-plan-results" aria-label="已核验写入结果">
          <h3>
            <CheckCircle2 size={18} /> 已核验的实际写入 · {run.results.length}
          </h3>
          {run.results.length === 0 ? (
            <p>服务器没有报告任何写入结果。</p>
          ) : (
            <ul>
              {run.results.map((result) => (
                <li key={`${result.kind}-${result.id}`}>
                  <strong>
                    {result.kind === "item"
                      ? "任务"
                      : result.kind === "series"
                        ? "重复系列"
                        : "日历安排"}
                  </strong>
                  <span>{result.id}</span>
                  <span>已回读核验</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {blocking ? (
        <p className="task-plan-blocked" role="alert">
          当前仍有阻断冲突，必须先修改提案或重新生成，无法确认写入。
        </p>
      ) : null}
      <footer className="task-planning-run__actions">
        {run.status === "awaiting_confirmation" || run.status === "needs_input" ? (
          <>
            <Button variant="secondary" onClick={onEdit}>
              <Pencil size={16} /> 编辑提案
            </Button>
            <Button disabled={!canConfirm} loading={pending} onClick={onConfirm}>
              <CheckCircle2 size={16} /> 确认并写入
            </Button>
          </>
        ) : null}
        {run.status === "planning" ||
        run.status === "awaiting_confirmation" ||
        run.status === "needs_input" ? (
          <Button variant="secondary" loading={pending} onClick={onCancel}>
            <StopCircle size={16} /> {run.status === "planning" ? "取消生成" : "取消提案"}
          </Button>
        ) : null}
        {run.status === "failed" || run.status === "cancelled" ? (
          <Button loading={pending} onClick={() => retryWith(taskPlanInputText(run.input))}>
            <RefreshCw size={16} /> 使用原始输入重试
          </Button>
        ) : null}
        {run.input.type === "replan" && run.status === "awaiting_confirmation" ? (
          <Button
            variant="secondary"
            loading={pending}
            onClick={() => retryWith(taskPlanInputText(run.input))}
          >
            根据当前数据重新生成
          </Button>
        ) : null}
        <Button variant="ghost" disabled={pending} onClick={onRefresh}>
          刷新运行状态
        </Button>
      </footer>
      {run.status === "failed" || run.status === "cancelled" || run.status === "needs_input" ? (
        <TaskPlanManualCapture originalText={taskPlanInputText(run.input)} today={today} />
      ) : null}
    </article>
  )
}
