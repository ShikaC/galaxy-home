import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { useState } from "react"
import type { Project } from "../../shared/projects.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { projectSchema } from "../lib/schemas.js"
import { FormDisclosure } from "./FormDisclosure.js"
import { Button } from "./ui/Button.js"
import { TextArea, TextField } from "./ui/Field.js"

export function NextProjectStageForm({ project }: { readonly project: Project }) {
  const client = useQueryClient()
  const [outcome, setOutcome] = useState("")
  const [stageTitle, setStageTitle] = useState("")
  const [currentTask, setCurrentTask] = useState("")
  const [nextTask, setNextTask] = useState("")
  const advance = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${project.id}/stages/advance`, projectSchema, {
        method: "POST",
        body: jsonBody({ outcome, stageTitle, currentTask, nextTask }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.projects }),
  })
  const canStart = stageTitle.trim().length > 0 && currentTask.trim().length > 0
  return (
    <section className="next-stage-panel">
      <h2>开始下一阶段</h2>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          advance.mutate()
        }}
      >
        <TextField
          label="下一阶段"
          onChange={(event) => setStageTitle(event.target.value)}
          value={stageTitle}
        />
        <TextField
          label="新的当前任务"
          onChange={(event) => setCurrentTask(event.target.value)}
          value={currentTask}
        />
        <div className="form-actions">
          <Button disabled={!canStart} loading={advance.isPending} type="submit">
            <ArrowRight size={16} />
            开始下一阶段
          </Button>
        </div>
        <FormDisclosure summary="记下成果和下一任务（可选）">
          <div className="form-stack">
            <TextArea
              label="本阶段成果"
              onChange={(event) => setOutcome(event.target.value)}
              rows={2}
              value={outcome}
            />
            <TextField
              label="新的下一任务"
              onChange={(event) => setNextTask(event.target.value)}
              placeholder="可以先空着"
              value={nextTask}
            />
          </div>
        </FormDisclosure>
        {advance.isError ? <p className="inline-error">{advance.error.message}</p> : null}
      </form>
    </section>
  )
}
