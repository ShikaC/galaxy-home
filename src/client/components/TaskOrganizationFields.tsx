import { Sparkles } from "lucide-react"
import { z } from "zod"
import type { Category, Item } from "../../shared/items.js"
import type { Project } from "../../shared/projects.js"
import { OrganizeProjectPicker } from "./OrganizeProjectPicker.js"
import { Button } from "./ui/Button.js"
import type { TaskEditorDraft } from "./useTaskEditorDraft.js"

const prioritySchema = z.enum(["none", "low", "medium", "high"])

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

export function TaskOrganizationFields({
  aiConfigured,
  categories,
  draft,
  item,
  onChange,
  onSuggest,
  parentOptions,
  projects,
  suggestNote,
  suggestPending,
}: {
  readonly aiConfigured: boolean
  readonly categories: readonly Category[]
  readonly draft: TaskEditorDraft
  readonly item: Item
  readonly onChange: (change: Partial<TaskEditorDraft>) => void
  readonly onSuggest: () => void
  readonly parentOptions: readonly Item[]
  readonly projects: readonly Project[]
  readonly suggestNote: string | null
  readonly suggestPending: boolean
}) {
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">优先级</span>
          <select
            className="field__control"
            onChange={(event) => onChange({ priority: prioritySchema.parse(event.target.value) })}
            value={draft.priority}
          >
            <option value="none">无</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">父任务</span>
          <select
            className="field__control"
            disabled={item.subtaskCount > 0}
            onChange={(event) => onChange({ parentId: event.target.value })}
            value={draft.parentId}
          >
            <option value="">无父任务</option>
            {parentOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="choice-group">
        <legend>分类（可多选）</legend>
        {aiConfigured ? (
          <Button
            disabled={categories.length === 0}
            loading={suggestPending}
            onClick={onSuggest}
            size="compact"
            variant="secondary"
          >
            <Sparkles size={14} />请 AI 建议分类
          </Button>
        ) : null}
        {categories.map((category) => (
          <label key={category.id}>
            <input
              checked={draft.categoryIds.includes(category.id)}
              onChange={() => onChange({ categoryIds: toggle(draft.categoryIds, category.id) })}
              type="checkbox"
            />
            <span className="color-swatch" style={{ background: category.color }} />
            {category.name}
          </label>
        ))}
      </fieldset>
      {suggestNote === null ? null : <p className="setting-note">{suggestNote}</p>}
      <OrganizeProjectPicker
        onToggle={(id) => onChange({ projectIds: toggle(draft.projectIds, id) })}
        projects={projects}
        selectedIds={draft.projectIds}
      />
    </>
  )
}
