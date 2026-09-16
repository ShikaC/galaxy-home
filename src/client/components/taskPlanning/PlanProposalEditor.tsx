import type { PlanDraftTask, PlanProposal, TaskPlanRun } from "../../../shared/taskPlanning.js"
import { planDate } from "../../../shared/taskPlanning.js"
import { Button } from "../ui/Button.js"
import { TextField } from "../ui/Field.js"

// plan 模式的提案编辑：调整标题、时长与日期，或移除任务。
// 引用关系（sourceIds / existingItemId）由生成阶段确定，这里不允许改动。
export function PlanProposalEditor({
  onChange,
  proposal,
  run,
}: {
  readonly proposal: PlanProposal
  readonly run: TaskPlanRun
  readonly onChange: (proposal: PlanProposal) => void
}) {
  const input = run.input
  if (input.type !== "plan") throw new Error("PlanProposalEditor 只能用于 plan 模式的任务计划")
  const days = Array.from({ length: input.horizonDays }, (_, index) => index)
  const update = (draftId: string, patch: Partial<PlanDraftTask>): void => {
    onChange({
      ...proposal,
      tasks: proposal.tasks.map((task) =>
        task.draftId === draftId ? { ...task, ...patch } : task,
      ),
    })
  }
  return (
    <section className="plan-draft-editor" aria-label="调整行动计划">
      <header>
        <h3>把安排调到适合自己</h3>
        <p>调整不会调用模型。保存后再确认执行。</p>
      </header>
      {proposal.tasks.map((task, index) => (
        <section className="plan-draft-task" key={task.draftId}>
          <TextField
            label={`任务 ${index + 1}`}
            required
            maxLength={240}
            value={task.title}
            readOnly={task.existingItemId !== null}
            {...(task.existingItemId === null ? {} : { hint: "复用已有任务，保留原标题。" })}
            onChange={(event) => update(task.draftId, { title: event.target.value })}
          />
          <p>{task.reason}</p>
          <div className="plan-edit-controls">
            <label className="field">
              <span className="field__label">任务 {index + 1} 日期</span>
              <select
                className="field__control"
                value={task.dayOffset}
                onChange={(event) =>
                  update(task.draftId, { dayOffset: Number(event.target.value) })
                }
              >
                {days.map((day) => (
                  <option key={planDate(input.startDate, day)} value={day}>
                    {planDate(input.startDate, day)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              aria-label={`移除任务 ${index + 1}`}
              onClick={() =>
                onChange({
                  ...proposal,
                  tasks: proposal.tasks.filter((item) => item.draftId !== task.draftId),
                })
              }
            >
              移除
            </Button>
          </div>
        </section>
      ))}
    </section>
  )
}
