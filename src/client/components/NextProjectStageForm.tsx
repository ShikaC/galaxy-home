import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { useState } from "react"
import type { Project } from "../../shared/projects.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { projectSchema } from "../lib/schemas.js"
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
  return (
    <section className="next-stage-panel">
      <h2>完成阶段</h2>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          advance.mutate()
        }}
      >
        <TextArea
          label="本阶段成果"
          onChange={(event) => setOutcome(event.target.value)}
          rows={2}
          value={outcome}
        />
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
        <TextField
          label="新的下一任务"
          onChange={(event) => setNextTask(event.target.value)}
          value={nextTask}
        />
        {advance.isError ? <p className="inline-error">{advance.error.message}</p> : null}
        <Button
          disabled={
            !outcome.trim() || !stageTitle.trim() || !currentTask.trim() || !nextTask.trim()
          }
          loading={advance.isPending}
          type="submit"
        >
          <ArrowRight size={16} />
          开始下一阶段
        </Button>
      </form>
    </section>
  )
}
