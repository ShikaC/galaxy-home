import type { CalendarSnapshot } from "../../../shared/calendar.js"
import type { TaskPlanProposal } from "../../../shared/taskPlanning.js"
import { localDateTimeInputFor } from "../../lib/date.js"
import { TextArea, TextField } from "../ui/Field.js"
import { TaskPlanTimeField } from "./TaskPlanTimeField.js"

type ReplanProposal = Extract<TaskPlanProposal, { readonly kind: "replan" }>
type ReplanChange = ReplanProposal["changes"][number]
const actionLabels = { keep: "保持不变", move: "移动", create: "新建并安排" } as const

export function ReplanProposalEditor({
  proposal,
  snapshot,
  onChange,
}: {
  readonly proposal: ReplanProposal
  readonly snapshot: CalendarSnapshot | null
  readonly onChange: (proposal: ReplanProposal) => void
}) {
  const update = (position: number, next: ReplanChange) =>
    onChange({
      ...proposal,
      changes: proposal.changes.map((change, index) => (index === position ? next : change)),
    })
  return (
    <div className="task-plan-editor-groups">
      {proposal.changes.map((change, index) => {
        const before = "before" in change ? change.before : null
        const after = change.after
        return (
          <fieldset
            className={`task-plan-edit-card task-plan-edit-card--${change.action}`}
            key={"itemId" in change ? change.itemId : change.draftId}
          >
            <legend>
              {actionLabels[change.action]} {index + 1}
            </legend>
            {change.action === "create" ? (
              <TextField
                label={`新任务 ${index + 1} 标题`}
                required
                value={change.title}
                onChange={(event) => update(index, { ...change, title: event.target.value })}
              />
            ) : (
              <strong>
                {snapshot?.items.find((item) => item.id === change.itemId)?.title ??
                  `任务 ${change.itemId}`}
              </strong>
            )}
            <TextArea
              label={`变更 ${index + 1} 原因`}
              rows={2}
              required
              value={change.reason}
              onChange={(event) => update(index, { ...change, reason: event.target.value })}
            />
            {before ? (
              <p className="task-plan-before">
                <strong>原安排</strong>
                {localDateTimeInputFor(before.startAt, before.timezone).replace("T", " ")} 至{" "}
                {localDateTimeInputFor(before.endAt, before.timezone).replace("T", " ")}
              </p>
            ) : null}
            {after && change.action !== "keep" ? (
              <div className="task-plan-edit-grid">
                <TaskPlanTimeField
                  label={`变更 ${index + 1} 新开始时间`}
                  value={after.startAt}
                  timezone={after.timezone}
                  onChange={(startAt) => update(index, { ...change, after: { ...after, startAt } })}
                />
                <TaskPlanTimeField
                  label={`变更 ${index + 1} 新结束时间`}
                  value={after.endAt}
                  timezone={after.timezone}
                  onChange={(endAt) => update(index, { ...change, after: { ...after, endAt } })}
                />
              </div>
            ) : (
              <p>保留当前安排；固定、完成和锁定任务受到保护。</p>
            )}
          </fieldset>
        )
      })}
    </div>
  )
}
