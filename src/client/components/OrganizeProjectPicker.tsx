import type { Project } from "../../shared/projects.js"

export function OrganizeProjectPicker({
  onToggle,
  projects,
  selectedIds,
}: {
  readonly onToggle: (id: string) => void
  readonly projects: readonly Project[]
  readonly selectedIds: readonly string[]
}) {
  return (
    <fieldset className="choice-group">
      <legend>关联项目（可多选）</legend>
      {projects.map((project) => (
        <label key={project.id}>
          <input
            checked={selectedIds.includes(project.id)}
            name={`organize-project-${project.id}`}
            onChange={() => onToggle(project.id)}
            type="checkbox"
          />
          {project.name}
        </label>
      ))}
    </fieldset>
  )
}
