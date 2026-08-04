import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Bot, CalendarPlus, Check, Pause, Play } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import type { Project } from "../../shared/projects.js"
import { useAppTime } from "../components/AppContext.js"
import { NextProjectStageForm } from "../components/NextProjectStageForm.js"
import { PageHeader } from "../components/PageHeader.js"
import { ProjectAiPlanner } from "../components/ProjectAiPlanner.js"
import { ProjectEditPanel } from "../components/ProjectEditPanel.js"
import { ProjectTimeline } from "../components/ProjectTimeline.js"
import { Button } from "../components/ui/Button.js"
import { TextArea, TextField } from "../components/ui/Field.js"
import { Badge, ProgressBar } from "../components/ui/Status.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta, useProjects } from "../lib/queries.js"
import { itemSchema, projectSchema } from "../lib/schemas.js"

export function ProjectDetailPage() {
  const { id } = useParams()
  const projects = useProjects()
  const meta = useMeta()
  const { today } = useAppTime()
  const client = useQueryClient()
  const project = projects.data?.find((entry) => entry.id === id)
  const [outcome, setOutcome] = useState("")
  const [obstacle, setObstacle] = useState("")
  const [nextTask, setNextTask] = useState("")
  const advance = useMutation({
    mutationFn: () =>
      apiVoid(`/api/projects/${id ?? ""}/advance`, {
        method: "POST",
        body: jsonBody({
          outcome: outcome || null,
          obstacle: obstacle || null,
          nextTask: nextTask || null,
        }),
      }),
    onSuccess: () => {
      setOutcome("")
      setObstacle("")
      setNextTask("")
      void client.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })
  const advanceWithAi = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${id ?? ""}/ai/feedback`, projectSchema, {
        method: "POST",
        body: jsonBody({ outcome: outcome || null, obstacle: obstacle || null }),
      }),
    onSuccess: () => {
      setOutcome("")
      setObstacle("")
      setNextTask("")
      void client.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })
  const addRecommendation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${id ?? ""}/current-task/today`, itemSchema, {
        method: "POST",
        body: jsonBody({ localDate: today }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["items"] }),
  })
  const changeStatus = useMutation({
    mutationFn: (status: Project["status"]) =>
      apiRequest(`/api/projects/${id ?? ""}`, projectSchema, {
        method: "PATCH",
        body: jsonBody({ status }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.projects }),
  })
  if (project === undefined)
    return (
      <div className="page">
        <Link className="text-action" to="/projects">
          <ArrowLeft size={16} />
          返回项目
        </Link>
        <p className="page-loading">正在读取项目...</p>
      </div>
    )
  const recommendationAdded =
    addRecommendation.isSuccess && addRecommendation.data.title === project.currentTask?.title
  return (
    <div className="page">
      <Link className="text-action back-link" to="/projects">
        <ArrowLeft size={16} />
        返回项目
      </Link>
      <PageHeader
        actions={
          <Button
            onClick={() => changeStatus.mutate(project.status === "active" ? "paused" : "active")}
            variant="secondary"
          >
            {project.status === "active" ? <Pause size={16} /> : <Play size={16} />}
            {project.status === "active" ? "暂停" : "恢复进行"}
          </Button>
        }
        eyebrow={
          project.status === "active"
            ? "正在推进"
            : project.status === "paused"
              ? "项目已暂停"
              : project.status === "completed"
                ? "项目已完成"
                : "项目已归档"
        }
        subtitle={project.desiredOutcome}
        title={project.name}
      />
      <div className="project-detail-grid">
        <section className="current-stage">
          <header>
            <div>
              <span className="project-section-label">当前阶段</span>
              <h2>{project.stageTitle}</h2>
            </div>
            <Badge tone="positive">只看现在</Badge>
          </header>
          <div className="current-task">
            <div className="current-task__header">
              <span className="project-section-label">当前任务</span>
              {project.currentTask?.source === "ai" ? (
                <Button
                  disabled={project.status !== "active" || recommendationAdded}
                  loading={addRecommendation.isPending}
                  onClick={() => addRecommendation.mutate()}
                  size="compact"
                  variant="secondary"
                >
                  {recommendationAdded ? <Check size={14} /> : <CalendarPlus size={14} />}
                  {recommendationAdded ? "已加入今日" : "加入今日"}
                </Button>
              ) : null}
            </div>
            <strong>{project.currentTask?.title ?? "等待设置"}</strong>
            {addRecommendation.isError ? (
              <p className="inline-error">{addRecommendation.error.message}</p>
            ) : null}
          </div>
          <div className="next-task">
            <span className="project-section-label">下一任务</span>
            <p>{project.nextTask?.title ?? "完成当前任务后再决定"}</p>
          </div>
          <ProgressBar
            label={project.progressSource === "ai" ? "AI 估算" : "手动进度"}
            value={project.progress}
          />
          <dl className="project-facts">
            <div>
              <dt>截止日期</dt>
              <dd>{project.deadlineDate ?? "未设置"}</dd>
            </div>
            <div>
              <dt>开始原因</dt>
              <dd>{project.reason ?? "未设置"}</dd>
            </div>
          </dl>
        </section>
        {project.currentTask === null && project.nextTask === null ? (
          <NextProjectStageForm project={project} />
        ) : (
          <section className="feedback-panel">
            <h2>完成与反馈</h2>
            <p>反馈可跳过。人工记录会成为以后 AI 恢复时的事实基线。</p>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault()
                advance.mutate()
              }}
            >
              <TextArea
                label="实际成果（可选）"
                onChange={(event) => setOutcome(event.target.value)}
                rows={2}
                value={outcome}
              />
              <TextArea
                label="遇到的阻碍（可选）"
                onChange={(event) => setObstacle(event.target.value)}
                rows={2}
                value={obstacle}
              />
              <TextField
                label="新的下一任务（可选）"
                onChange={(event) => setNextTask(event.target.value)}
                placeholder="原下一任务会先成为当前任务"
                value={nextTask}
              />
              <div className="form-actions">
                <Button
                  disabled={project.currentTask === null || project.status !== "active"}
                  loading={advance.isPending}
                  type="submit"
                >
                  <Check size={16} />
                  手动完成
                </Button>
                <Button
                  disabled={
                    !meta.data?.ai.configured ||
                    project.currentTask === null ||
                    project.status !== "active"
                  }
                  loading={advanceWithAi.isPending}
                  onClick={() => advanceWithAi.mutate()}
                  variant="secondary"
                >
                  <Bot size={16} />
                  AI 调整并完成
                </Button>
              </div>
              {advance.isError || advanceWithAi.isError ? (
                <p className="inline-error">
                  {advance.error?.message ?? advanceWithAi.error?.message}
                </p>
              ) : null}
            </form>
          </section>
        )}
      </div>
      <ProjectAiPlanner configured={meta.data?.ai.configured ?? false} project={project} />
      <ProjectEditPanel project={project} />
      <ProjectTimeline project={project} />
    </div>
  )
}
