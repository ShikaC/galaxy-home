import { useMutation, useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { projectSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"
import { TextArea, TextField } from "./ui/Field.js"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"

export function ProjectDialog({
  onClose,
  open,
}: {
  readonly onClose: () => void
  readonly open: boolean
}) {
  const client = useQueryClient()
  const [name, setName] = useState("")
  const [outcome, setOutcome] = useState("")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [deadline, setDeadline] = useState("")
  const [stage, setStage] = useState("迈出第一步")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  useEffect(() => {
    if (!open) return
    setName("")
    setOutcome("")
    setReason("")
    setNotes("")
    setDeadline("")
    setStage("迈出第一步")
    setCurrent("")
    setNext("")
  }, [open])
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/projects", projectSchema, {
        method: "POST",
        body: jsonBody({
          name,
          desiredOutcome: outcome,
          reason: reason || null,
          notes: notes || null,
          deadlineDate: deadline || null,
          stageTitle: stage,
          currentTask: current,
          nextTask: next,
        }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.projects })
      onClose()
    },
  })
  if (!open) return null
  return (
    <DialogSurface ariaLabelledBy="new-project-title" onClose={onClose}>
      <header className="dialog__header">
        <div>
          <p className="eyebrow">新周期项目</p>
          <h2 id="new-project-title">只规划足够开始的部分</h2>
        </div>
        <IconButton label="关闭项目创建" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <TextField
          autoFocus
          label="项目名称"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <TextArea
          label="最终希望达到的结果"
          onChange={(event) => setOutcome(event.target.value)}
          rows={2}
          value={outcome}
        />
        <div className="form-grid">
          <TextField
            label="开始原因（可选）"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          <TextField
            label="截止日期（可选）"
            onChange={(event) => setDeadline(event.target.value)}
            type="date"
            value={deadline}
          />
        </div>
        <TextArea
          label="补充说明（可选）"
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          value={notes}
        />
        <div className="manual-plan">
          <p>
            <strong>手动拆解</strong>
            <span className="manual-plan__note">AI 未配置也能继续，之后会以人工现状为准。</span>
          </p>
          <TextField
            label="当前阶段"
            onChange={(event) => setStage(event.target.value)}
            value={stage}
          />
          <TextField
            label="当前任务"
            onChange={(event) => setCurrent(event.target.value)}
            placeholder="一个可以直接开始的动作"
            value={current}
          />
          <TextField
            label="下一任务"
            onChange={(event) => setNext(event.target.value)}
            placeholder="只写紧接着的一步"
            value={next}
          />
        </div>
        {create.isError ? <p className="inline-error">{create.error.message}</p> : null}
        <footer className="dialog__actions">
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button
            disabled={!name.trim() || !outcome.trim() || !current.trim() || !next.trim()}
            loading={create.isPending}
            type="submit"
          >
            创建项目
          </Button>
        </footer>
      </form>
    </DialogSurface>
  )
}
