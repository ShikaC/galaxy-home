import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bot, Check } from "lucide-react"
import { useState } from "react"
import type { Project } from "../../shared/projects.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { projectSchema } from "../lib/schemas.js"
import { FormDisclosure } from "./FormDisclosure.js"
import { Button } from "./ui/Button.js"
import { TextArea, TextField } from "./ui/Field.js"

function refreshAfterAdvance(client: ReturnType<typeof useQueryClient>): void {
  void client.invalidateQueries({ queryKey: queryKeys.projects })
  void client.invalidateQueries({ queryKey: ["items"] })
}

export function ProjectAdvanceForm({
  aiConfigured,
  project,
}: {
  readonly aiConfigured: boolean
  readonly project: Project
}) {
  const client = useQueryClient()
  const [outcome, setOutcome] = useState("")
  const [obstacle, setObstacle] = useState("")
  const [nextTask, setNextTask] = useState("")
  const [notesCycle, setNotesCycle] = useState(0)
  const advance = useMutation({
    mutationFn: () =>
      apiVoid(`/api/projects/${project.id}/advance`, {
        method: "POST",
        body: jsonBody({
          outcome: outcome || null,
          obstacle: obstacle || null,
          nextTask: nextTask || null,
        }),
      }),
    onSuccess: () => {
      setOutcome("")
      setObstacle("")
      setNextTask("")
      setNotesCycle((cycle) => cycle + 1)
      refreshAfterAdvance(client)
    },
  })
  const advanceWithAi = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${project.id}/ai/feedback`, projectSchema, {
        method: "POST",
        body: jsonBody({ outcome: outcome || null, obstacle: obstacle || null }),
      }),
    onSuccess: () => {
      setOutcome("")
      setObstacle("")
      setNextTask("")
      setNotesCycle((cycle) => cycle + 1)
      refreshAfterAdvance(client)
    },
  })
  const canAdvance = project.currentTask !== null && project.status === "active"
  return (
    <section className="feedback-panel">
      <h2>做完了吗</h2>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          advance.mutate()
        }}
      >
        <div className="form-actions">
          <Button disabled={!canAdvance} loading={advance.isPending} type="submit">
            <Check size={16} />
            手动完成
          </Button>
          {aiConfigured ? (
            <Button
              disabled={!canAdvance}
              loading={advanceWithAi.isPending}
              onClick={() => advanceWithAi.mutate()}
              type="button"
              variant="secondary"
            >
              <Bot size={16} />
              AI 调整并完成
            </Button>
          ) : null}
        </div>
        <FormDisclosure key={notesCycle} summary="记下成果（可选）">
          <div className="form-stack">
            <TextArea
              label="实际成果（可选）"
              onChange={(event) => setOutcome(event.target.value)}
              rows={2}
              value={outcome}
            />
            <TextArea
              label="遇到的阻碍（可选）"
              onChange={(event) => setObstacle(event.target.value)}
              rows={2}
              value={obstacle}
            />
            <TextField
              label="新的下一任务（可选）"
              onChange={(event) => setNextTask(event.target.value)}
              placeholder="原下一任务会先成为当前任务"
              value={nextTask}
            />
          </div>
        </FormDisclosure>
        {advance.isError || advanceWithAi.isError ? (
          <p className="inline-error">{advance.error?.message ?? advanceWithAi.error?.message}</p>
        ) : null}
      </form>
    </section>
  )
}
