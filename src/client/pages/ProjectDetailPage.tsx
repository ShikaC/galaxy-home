import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Pause, Play } from "lucide-react"
import { Link, useParams } from "react-router"
import type { Item } from "../../shared/items.js"
import type { Project } from "../../shared/projects.js"
import { AddCurrentTaskToToday } from "../components/AddCurrentTaskToToday.js"
import { useAppTime } from "../components/AppContext.js"
import { NextProjectStageForm } from "../components/NextProjectStageForm.js"
import { PageHeader } from "../components/PageHeader.js"
import { ProjectAdvanceForm } from "../components/ProjectAdvanceForm.js"
import { ProjectAiPlanner } from "../components/ProjectAiPlanner.js"
import { ProjectEditPanel } from "../components/ProjectEditPanel.js"
import { ProjectTimeline } from "../components/ProjectTimeline.js"
import { Button } from "../components/ui/Button.js"
import { Badge, ProgressBar } from "../components/ui/Status.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { awaitingNextStage } from "../lib/projectStage.js"
import { queryKeys, useMeta, useProjects } from "../lib/queries.js"
import { itemsSchema, projectSchema } from "../lib/schemas.js"

export function ProjectDetailPage() {
  const { id } = useParams()
  const projects = useProjects()
  const meta = useMeta()
  const { today } = useAppTime()
  const client = useQueryClient()
  const project = projects.data?.find((entry) => entry.id === id)
  const linkedItems = useQuery({
    queryKey: ["items", "project", id, today],
    enabled: id !== undefined,
    queryFn: () =>
      apiRequest(`/api/items?projectId=${id ?? ""}&view=active&localDate=${today}`, itemsSchema),
  })
  const setCurrentFromItem = useMutation({
    mutationFn: (item: Item) =>
      apiRequest(`/api/projects/${id ?? ""}`, projectSchema, {
        method: "PATCH",
        body: jsonBody({ currentTask: item.title }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })
  const changeStatus = useMutation({
    mutationFn: (status: Project["status"]) =>
      status === "active"
        ? apiRequest(`/api/projects/${id ?? ""}/resume`, projectSchema, { method: "POST" })
        : apiRequest(`/api/projects/${id ?? ""}`, projectSchema, {
            method: "PATCH",
            body: jsonBody({ status }),
          }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.projects })
      void client.invalidateQueries({ queryKey: ["project-ai", id] })
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: queryKeys.projects })
    },
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
      {changeStatus.isError ? <p className="inline-error">{changeStatus.error.message}</p> : null}
      <div className="project-detail-grid">
        <section className="current-stage">
          <header>
            <div>
              <span className="project-section-label">当前阶段</span>
              <h2>{project.stageTitle}</h2>
            </div>
            <Badge tone="positive">只看现在</Badge>
          </header>
          {project.currentTask !== null ? (
            <AddCurrentTaskToToday
              disabled={project.status !== "active"}
              key={project.currentTask.id}
              localDate={today}
              projectId={project.id}
              taskTitle={project.currentTask.title}
            />
          ) : awaitingNextStage(project) ? null : (
            <div className="current-task">
              <div className="current-task__header">
                <span className="project-section-label">当前任务</span>
              </div>
              <strong>等待设置</strong>
            </div>
          )}
          {awaitingNextStage(project) ? null : (
            <div className="next-task">
              <span className="project-section-label">下一任务</span>
              <p>{project.nextTask?.title ?? "完成当前任务后再决定"}</p>
            </div>
          )}
          <ProgressBar
            label={project.progressSource === "ai" ? "AI 估算" : "手动进度"}
            value={project.progress}
          />
          {project.deadlineDate !== null || project.reason !== null ? (
            <dl className="project-facts">
              {project.deadlineDate === null ? null : (
                <div>
                  <dt>截止日期</dt>
                  <dd>{project.deadlineDate}</dd>
                </div>
              )}
              {project.reason === null ? null : (
                <div>
                  <dt>开始原因</dt>
                  <dd>{project.reason}</dd>
                </div>
              )}
            </dl>
          ) : null}
          {(linkedItems.data?.length ?? 0) === 0 ? null : (
            <section className="linked-items">
              <span className="project-section-label">关联待办</span>
              <ul className="linked-items__list">
                {linkedItems.data?.map((item) => {
                  const isCurrent = project.currentTask?.title === item.title
                  return (
                    <li key={item.id}>
                      <span>{item.title}</span>
                      <Button
                        disabled={
                          project.status !== "active" || isCurrent || setCurrentFromItem.isPending
                        }
                        onClick={() => setCurrentFromItem.mutate(item)}
                        size="compact"
                        variant="ghost"
                      >
                        {isCurrent ? "当前任务" : "设为当前任务"}
                      </Button>
                    </li>
                  )
                })}
              </ul>
              {setCurrentFromItem.isError ? (
                <p className="inline-error">{setCurrentFromItem.error.message}</p>
              ) : null}
            </section>
          )}
        </section>
        {awaitingNextStage(project) ? (
          <NextProjectStageForm project={project} />
        ) : (
          <ProjectAdvanceForm aiConfigured={meta.data?.ai.configured ?? false} project={project} />
        )}
      </div>
      <ProjectAiPlanner configured={meta.data?.ai.configured ?? false} project={project} />
      <ProjectEditPanel
        key={awaitingNextStage(project) ? "next-stage" : "advance"}
        project={project}
      />
      <ProjectTimeline project={project} />
    </div>
  )
}
