import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Save } from "lucide-react"
import { useEffect, useState } from "react"
import type { Project } from "../../shared/projects.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { projectSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"
import { TextArea, TextField } from "./ui/Field.js"

export function ProjectEditPanel({ project }: { readonly project: Project }) {
  const client = useQueryClient()
  const [name, setName] = useState(project.name)
  const [desiredOutcome, setDesiredOutcome] = useState(project.desiredOutcome)
  const [reason, setReason] = useState(project.reason ?? "")
  const [notes, setNotes] = useState(project.notes ?? "")
  const [deadlineDate, setDeadlineDate] = useState(project.deadlineDate ?? "")
  const [status, setStatus] = useState(project.status)
  const [progress, setProgress] = useState(project.progress)
  const [pinned, setPinned] = useState(project.pinned)
  const [stageTitle, setStageTitle] = useState(project.stageTitle)
  const [currentTask, setCurrentTask] = useState(project.currentTask?.title ?? "")
  const [nextTask, setNextTask] = useState(project.nextTask?.title ?? "")
  useEffect(() => {
    setName(project.name)
    setDesiredOutcome(project.desiredOutcome)
    setReason(project.reason ?? "")
    setNotes(project.notes ?? "")
    setDeadlineDate(project.deadlineDate ?? "")
    setStatus(project.status)
    setProgress(project.progress)
    setPinned(project.pinned)
    setStageTitle(project.stageTitle)
    setCurrentTask(project.currentTask?.title ?? "")
    setNextTask(project.nextTask?.title ?? "")
  }, [project])
  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${project.id}`, projectSchema, {
        method: "PATCH",
        body: jsonBody({
          name,
          desiredOutcome,
          reason: reason || null,
          notes: notes || null,
          deadlineDate: deadlineDate || null,
          status,
          progress,
          pinned,
          stageTitle,
          currentTask: currentTask || null,
          nextTask: nextTask || null,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.projects }),
  })
  return (
    <details className="project-editor">
      <summary>手动维护项目</summary>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <div className="form-grid">
          <TextField
            label="项目名称"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <TextField
            label="截止日期"
            onChange={(event) => setDeadlineDate(event.target.value)}
            type="date"
            value={deadlineDate}
          />
        </div>
        <TextArea
          label="最终目标"
          onChange={(event) => setDesiredOutcome(event.target.value)}
          rows={2}
          value={desiredOutcome}
        />
        <div className="form-grid">
          <TextArea
            label="开始原因"
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            value={reason}
          />
          <TextArea
            label="补充说明"
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            value={notes}
          />
        </div>
        <div className="form-grid form-grid--three">
          <label className="field">
            <span className="field__label">项目状态</span>
            <select
              className="field__control"
              onChange={(event) =>
                setStatus(
                  event.target.value === "paused"
                    ? "paused"
                    : event.target.value === "completed"
                      ? "completed"
                      : event.target.value === "archived"
                        ? "archived"
                        : "active",
                )
              }
              value={status}
            >
              <option value="active">进行中</option>
              <option value="paused">暂停</option>
              <option value="completed">已完成</option>
              <option value="archived">已归档</option>
            </select>
          </label>
          <TextField
            label="手动进度"
            max={100}
            min={0}
            onChange={(event) => setProgress(Number(event.target.value))}
            type="number"
            value={progress}
          />
          <label className="check-line">
            <input
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
              type="checkbox"
            />
            置顶到首页
          </label>
        </div>
        <TextField
          label="当前阶段"
          onChange={(event) => setStageTitle(event.target.value)}
          value={stageTitle}
        />
        <div className="form-grid">
          <TextField
            label="当前任务"
            onChange={(event) => setCurrentTask(event.target.value)}
            value={currentTask}
          />
          <TextField
            label="下一任务"
            onChange={(event) => setNextTask(event.target.value)}
            value={nextTask}
          />
        </div>
        {save.isError ? <p className="inline-error">{save.error.message}</p> : null}
        <Button
          disabled={!name.trim() || !desiredOutcome.trim() || !stageTitle.trim()}
          loading={save.isPending}
          type="submit"
        >
          <Save size={16} />
          保存人工现状
        </Button>
      </form>
    </details>
  )
}
