import { FolderKanban } from "lucide-react"
import { Link } from "react-router"
import type { Project } from "../../shared/projects.js"
import { pinnedProjectCue } from "../lib/projectStage.js"
import { EmptyState } from "./ui/EmptyState.js"
import { ProgressBar } from "./ui/Status.js"

export function HomePinnedProjects({
  projects,
}: {
  readonly projects: readonly Project[] | undefined
}) {
  const pinned = projects
    ?.filter((project) => project.status === "active" && project.pinned)
    .slice(0, 3)
  if (pinned === undefined || pinned.length === 0) {
    return (
      <EmptyState
        action={
          <Link className="text-action" to="/projects">
            去项目页置顶
          </Link>
        }
        description="把正在推进的周期项目置顶后，会出现在这里。没有项目也没关系。"
        icon={FolderKanban}
        title="还没有置顶项目"
      />
    )
  }
  return pinned.map((project) => (
    <Link className="project-summary" key={project.id} to={`/projects/${project.id}`}>
      <strong>{project.name}</strong>
      <p>{pinnedProjectCue(project)}</p>
      <ProgressBar
        label={project.progressSource === "ai" ? "AI 估算" : "手动进度"}
        value={project.progress}
      />
    </Link>
  ))
}
