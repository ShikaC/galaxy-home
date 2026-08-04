import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FolderKanban, Plus } from "lucide-react"
import { useState } from "react"
import type { Project } from "../../shared/projects.js"
import { PageHeader, SectionHeader } from "../components/PageHeader.js"
import { ProjectCard } from "../components/ProjectCard.js"
import { ProjectDialog } from "../components/ProjectDialog.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useProjects } from "../lib/queries.js"
import { projectSchema } from "../lib/schemas.js"

const STATUS_LABELS = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
} as const

export function ProjectsPage() {
  const client = useQueryClient()
  const projects = useProjects()
  const [open, setOpen] = useState(false)
  const pin = useMutation({
    mutationFn: (project: Project) =>
      apiRequest(`/api/projects/${project.id}`, projectSchema, {
        method: "PATCH",
        body: jsonBody({ pinned: !project.pinned }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.projects }),
  })
  const remove = useMutation({
    mutationFn: (project: Project) => apiVoid(`/api/projects/${project.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.projects })
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  return (
    <div className="page">
      <PageHeader
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            新项目
          </Button>
        }
        subtitle="只看当前阶段与紧接着的一步，不提前展开未知的完整任务链。"
        title="周期项目"
      />
      {projects.data?.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => setOpen(true)} size="compact">
              创建第一个项目
            </Button>
          }
          description="把一个长期目标缩小到今天能开始的动作。"
          icon={FolderKanban}
          title="还没有周期项目"
        />
      ) : (
        <div className="project-sections">
          {Object.entries(STATUS_LABELS).map(([status, label]) => {
            const group = projects.data?.filter((project) => project.status === status) ?? []
            if (group.length === 0) return null
            return (
              <section className="project-section" key={status}>
                <SectionHeader title={`${label} ${group.length}`} />
                <div className="project-grid">
                  {group.map((project) => (
                    <ProjectCard
                      key={project.id}
                      onDelete={() => remove.mutate(project)}
                      onPin={() => pin.mutate(project)}
                      project={project}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {pin.isError || remove.isError ? (
        <p className="inline-error">{pin.error?.message ?? remove.error?.message}</p>
      ) : null}
      <ProjectDialog onClose={() => setOpen(false)} open={open} />
    </div>
  )
}
