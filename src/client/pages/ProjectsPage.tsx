import { FolderKanban, Plus } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { PageHeader } from "../components/PageHeader.js"
import { ProjectDialog } from "../components/ProjectDialog.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { Badge, ProgressBar } from "../components/ui/Status.js"
import { useProjects } from "../lib/queries.js"

const STATUS_LABELS = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
} as const

export function ProjectsPage() {
  const projects = useProjects()
  const [open, setOpen] = useState(false)
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
        <div className="project-grid">
          {projects.data?.map((project) => (
            <Link className="project-card" key={project.id} to={`/projects/${project.id}`}>
              <header>
                <h2>{project.name}</h2>
                <Badge tone={project.status === "active" ? "positive" : "neutral"}>
                  {STATUS_LABELS[project.status]}
                </Badge>
              </header>
              <p className="project-outcome">{project.desiredOutcome}</p>
              <dl>
                <div>
                  <dt>当前阶段</dt>
                  <dd>{project.stageTitle}</dd>
                </div>
                <div>
                  <dt>当前任务</dt>
                  <dd>{project.currentTask?.title ?? "尚未设置"}</dd>
                </div>
              </dl>
              <ProgressBar
                label={project.progressSource === "ai" ? "AI 估算" : "手动进度"}
                value={project.progress}
              />
            </Link>
          ))}
        </div>
      )}
      <ProjectDialog onClose={() => setOpen(false)} open={open} />
    </div>
  )
}
