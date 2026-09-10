import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Clock3, FileText, ShieldCheck } from "lucide-react"
import { useRef, useState } from "react"
import { Link } from "react-router"
import {
  normalizedTaskTitle,
  type PlanEdit,
  type PlanRun,
  planDate,
  planRunSchema,
} from "../../../shared/planning.js"
import { apiRequest, jsonBody } from "../../lib/api.js"
import { Button } from "../ui/Button.js"
import { PlanClarification } from "./PlanClarification.js"
import { PlanDraftEditor } from "./PlanDraftEditor.js"
import { PlanRunTrace } from "./PlanRunTrace.js"

export const planStatusLabel: Readonly<Record<PlanRun["status"], string>> = {
  planning: "正在准备",
  awaiting_confirmation: "等待你确认",
  needs_input: "需要补充信息",
  succeeded: "已安排并核验",
  failed: "需要处理",
  cancelled: "已取消",
}
export function PlanRunDetail({
  run,
  pending,
  onConfirm,
  onCancel,
  onRevise,
  onAnswer,
}: {
  readonly run: PlanRun
  readonly pending: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
  readonly onAnswer: (goal: string) => void
  readonly onRevise: () => void
}) {
  const [editing, setEditing] = useState<PlanRun | null>(null)
  const sourcesRef = useRef<HTMLDetailsElement>(null)
  const cache = useQueryClient()
  const edit = useMutation({
    mutationFn: (input: PlanEdit) =>
      apiRequest(`/api/plans/${run.id}`, planRunSchema, {
        method: "PATCH",
        body: jsonBody(input),
      }),
    onError: async () => {
      await cache.invalidateQueries({ queryKey: ["plan", run.id] })
    },
    onSuccess: async (saved) => {
      cache.setQueryData(["plan", saved.id], saved)
      setEditing(null)
      await cache.invalidateQueries({ queryKey: ["plans"] })
    },
  })
  const canExecute =
    run.status === "awaiting_confirmation" ||
    (run.status === "failed" && run.error?.code === "EXECUTION_FAILED")
  const compactGoal = run.input.goal.length > 60 || run.input.goal.includes("\n")
  const generated = run.proposal
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
      <h2>{compactGoal ? "这次的行动安排" : run.input.goal}</h2>
      {compactGoal ? (
        <details className="plan-original-goal">
          <summary>查看原始目标</summary>
          <p>{run.input.goal}</p>
        </details>
      ) : null}
      {(run.proposalRevision ?? 0) > 0 ? (
        <p className="plan-edit-notice">
          已由你调整 · 第 {run.proposalRevision} 版，请以当前任务为准。
        </p>
      ) : null}
      {generated ? <p className="plan-summary">{generated.summary}</p> : null}
      {run.status === "planning" ? (
        <p role="status">
          正在查找相关内容并检查计划。可以离开此页，稍后从记录中继续。取消后不会安排任务；已发出的模型请求可能仍会计费。
        </p>
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
        <PlanClarification run={run} pending={pending} onAnswer={onAnswer} onRevise={onRevise} />
      ) : null}
      {editing ? (
        <PlanDraftEditor
          run={editing}
          pending={edit.isPending}
          error={edit.error}
          onSave={(tasks) =>
            edit.mutate({ tasks, expectedRevision: editing.proposalRevision ?? 0 })
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
      {generated && !editing
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
                                <a
                                  href={`#source-${id}`}
                                  key={id}
                                  onClick={() => {
                                    if (sourcesRef.current) sourcesRef.current.open = true
                                  }}
                                >
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
      {editing ? null : canExecute ? (
        <div className="plan-confirm">
          <p>
            <ShieldCheck size={17} aria-hidden="true" />
            确认后将创建或复用任务，并排入以上日期；每天主要任务满 3 项时放入“稍后”。
          </p>
          <div className="button-row">
            <Button loading={pending} onClick={onConfirm}>
              {run.error?.code === "EXECUTION_FAILED" ? "安全重试执行" : "确认并安排任务"}
            </Button>
            {run.status === "awaiting_confirmation" ? (
              <Button
                disabled={pending}
                variant="secondary"
                onClick={() => {
                  edit.reset()
                  setEditing(run)
                }}
              >
                调整安排
              </Button>
            ) : null}
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
      <PlanRunTrace run={run} />
    </article>
  )
}
