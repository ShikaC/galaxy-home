import type { Project } from "../../shared/projects.js"
import { Badge } from "./ui/Status.js"

export function ProjectTimeline({ project }: { readonly project: Project }) {
  return (
    <section className="timeline-band">
      <h2>最近进展</h2>
      {project.recentProgress.length === 0 ? (
        <p>尚未记录任务反馈。</p>
      ) : (
        <ol className="progress-timeline">
          {project.recentProgress.map((progress) => (
            <li key={progress.id}>
              <time>{progress.createdAt.slice(0, 10)}</time>
              <div>
                <strong>{progress.taskTitle ?? "项目进展"}</strong>
                {progress.outcome === null ? null : <p>成果：{progress.outcome}</p>}
                {progress.obstacle === null ? null : <p>阻碍：{progress.obstacle}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <h2>已完成阶段</h2>
      {project.completedStages.length === 0 ? (
        <p>完成当前阶段后，阶段成果会出现在这里。</p>
      ) : (
        <ol className="stage-timeline">
          {project.completedStages.map((stage) => (
            <li key={stage.id}>
              <header>
                <strong>{stage.title}</strong>
                <Badge tone="positive">{stage.completedAt.slice(0, 10)}</Badge>
              </header>
              <p>{stage.outcome}</p>
              <ul>
                {stage.tasks.map((task) => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
