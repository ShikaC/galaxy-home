import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Check, RefreshCw, Send } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import type { Project } from "../../shared/projects.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { projectAiSessionSchema, projectSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"
import { TextArea } from "./ui/Field.js"
import { Badge, ProgressBar } from "./ui/Status.js"

export function ProjectAiPlanner({
  configured,
  project,
}: {
  readonly configured: boolean
  readonly project: Project
}) {
  const client = useQueryClient()
  const [answer, setAnswer] = useState("")
  const session = useQuery({
    queryKey: ["project-ai", project.id],
    queryFn: () => apiRequest(`/api/projects/${project.id}/ai`, projectAiSessionSchema.nullable()),
  })
  const refreshSession = () => client.invalidateQueries({ queryKey: ["project-ai", project.id] })
  const start = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${project.id}/ai/start`, projectAiSessionSchema, {
        method: "POST",
        body: jsonBody({ mode: "create" }),
      }),
    onSuccess: () => refreshSession(),
  })
  const submitAnswer = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${project.id}/ai/answer`, projectAiSessionSchema, {
        method: "POST",
        body: jsonBody({ answer }),
      }),
    onSuccess: () => {
      setAnswer("")
      void refreshSession()
    },
  })
  const apply = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${project.id}/ai/apply`, projectSchema, { method: "POST" }),
    onSuccess: () => {
      void refreshSession()
      void client.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })
  const current = session.data
  return (
    <section className="project-ai-panel">
      <header>
        <span className="project-ai-panel__title">
          <Bot size={18} />
          <strong>AI 渐进拆解</strong>
        </span>
        <Badge tone={configured ? "positive" : "waiting"}>{configured ? "可用" : "未配置"}</Badge>
      </header>
      {!configured ? (
        <p>
          当前保留手动方案。<Link to="/settings">配置 AI</Link>
        </p>
      ) : session.isPending ? (
        <p>正在读取拆解进度...</p>
      ) : current === null || current === undefined ? (
        <Button loading={start.isPending} onClick={() => start.mutate()} variant="secondary">
          <Bot size={16} />
          开始澄清
        </Button>
      ) : current.status === "clarifying" ? (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault()
            if (answer.trim()) submitAnswer.mutate()
          }}
        >
          <p className="project-ai-panel__question">{current.currentQuestion}</p>
          <small>
            {current.answeredCount + 1}/{current.totalQuestions}
          </small>
          <TextArea
            label="你的回答"
            onChange={(event) => setAnswer(event.target.value)}
            rows={2}
            value={answer}
          />
          <Button disabled={!answer.trim()} loading={submitAnswer.isPending} type="submit">
            <Send size={16} />
            继续
          </Button>
        </form>
      ) : current.status === "ready" && current.draft !== null ? (
        <div className="project-ai-preview">
          <dl>
            <div>
              <dt>当前阶段</dt>
              <dd>{current.draft.stageTitle}</dd>
            </div>
            <div>
              <dt>当前任务</dt>
              <dd>{current.draft.currentTask}</dd>
            </div>
            <div>
              <dt>下一任务</dt>
              <dd>{current.draft.nextTask}</dd>
            </div>
          </dl>
          <ProgressBar label="AI 估算" value={current.draft.progress} />
          <Button loading={apply.isPending} onClick={() => apply.mutate()}>
            <Check size={16} />
            采用此拆解
          </Button>
        </div>
      ) : (
        <Button loading={start.isPending} onClick={() => start.mutate()} variant="secondary">
          <RefreshCw size={16} />
          重新澄清
        </Button>
      )}
      {session.isError || start.isError || submitAnswer.isError || apply.isError ? (
        <p className="inline-error">
          {session.error?.message ??
            start.error?.message ??
            submitAnswer.error?.message ??
            apply.error?.message}
        </p>
      ) : null}
    </section>
  )
}
