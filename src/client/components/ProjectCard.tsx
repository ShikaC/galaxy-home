import { Pin, Trash2 } from "lucide-react"
import { Link } from "react-router"
import type { Project } from "../../shared/projects.js"
import { IconButton } from "./ui/IconButton.js"
import { Badge, ProgressBar } from "./ui/Status.js"

const STATUS_LABELS = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
} as const

export function ProjectCard({
  onDelete,
  onPin,
  project,
}: {
  readonly onDelete: () => void
  readonly onPin: () => void
  readonly project: Project
}) {
  return (
    <article className="project-card">
      <header>
        <Link to={`/projects/${project.id}`}>
          <h3>{project.name}</h3>
        </Link>
        <div className="project-card__actions">
          <Badge tone={project.status === "active" ? "positive" : "neutral"}>
            {STATUS_LABELS[project.status]}
          </Badge>
          <IconButton
            label={project.pinned ? `取消置顶 ${project.name}` : `置顶 ${project.name}`}
            onClick={onPin}
          >
            <Pin fill={project.pinned ? "currentColor" : "none"} size={15} />
          </IconButton>
          <IconButton label={`删除 ${project.name}`} onClick={onDelete}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </header>
      <Link className="project-card__body" to={`/projects/${project.id}`}>
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
    </article>
  )
}
