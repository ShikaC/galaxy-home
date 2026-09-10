import { useState } from "react"
import type { PlanRun } from "../../../shared/planning.js"
import { Button } from "../ui/Button.js"
import { TextArea } from "../ui/Field.js"

export function PlanClarification({
  run,
  pending,
  onAnswer,
  onRevise,
}: {
  readonly run: PlanRun
  readonly pending: boolean
  readonly onAnswer: (goal: string) => void
  readonly onRevise: () => void
}) {
  const [answer, setAnswer] = useState("")
  const goal = `${run.input.goal}\n\n补充问题：${run.proposal?.clarification ?? ""}\n我的回答：${answer.trim()}`
  const tooLong = goal.length > 2000
  return (
    <form
      className="plan-question"
      onSubmit={(event) => {
        event.preventDefault()
        if (answer.trim() && !tooLong) onAnswer(goal)
      }}
    >
      <strong>先确认一件事</strong>
      <p>{run.proposal?.clarification}</p>
      <TextArea
        label="补充信息"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        required
        rows={3}
        maxLength={2000}
        placeholder="回答这个问题，继续规划。"
        {...(tooLong
          ? { error: "目标与补充信息合计需在 2000 字符内，请缩短回答或调整原始目标。" }
          : {})}
      />
      <div className="button-row">
        <Button type="submit" loading={pending} disabled={!answer.trim() || tooLong}>
          补充并继续规划
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onRevise}>
          补充目标后重新生成
        </Button>
      </div>
    </form>
  )
}
