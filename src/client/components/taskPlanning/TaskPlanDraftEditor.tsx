import { useEffect, useState } from "react"
import { useBlocker } from "react-router"
import { ERROR_CODES } from "../../../shared/errorCodes.js"
import {
  type TaskPlanProposal,
  type TaskPlanRun,
  taskPlanEditSchema,
} from "../../../shared/taskPlanning.js"
import { ApiError } from "../../lib/api.js"
import { Button } from "../ui/Button.js"
import { DialogSurface } from "../ui/ModalSurface.js"
import { CaptureProposalEditor } from "./CaptureProposalEditor.js"
import { taskPlanEditorStateSchema } from "./draftState.js"
import { editorDraftKey, readDraft, writeDraft } from "./draftStorage.js"
import { PlanProposalEditor } from "./PlanProposalEditor.js"
import { ReplanProposalEditor } from "./ReplanProposalEditor.js"

export function TaskPlanDraftEditor({
  error,
  onClose,
  onReload,
  onSave,
  pending,
  run,
}: {
  readonly error: Error | null
  readonly onClose: () => void
  readonly onReload: () => void
  readonly onSave: (edit: {
    readonly expectedRevision: number
    readonly proposal: TaskPlanProposal
  }) => void
  readonly pending: boolean
  readonly run: TaskPlanRun
}) {
  const [saved] = useState(() => readDraft(editorDraftKey(run.id), taskPlanEditorStateSchema))
  const [baseline] = useState(
    () =>
      saved?.baseline ?? {
        proposal: run.proposal,
        revision: run.draftRevision,
        fingerprint: run.baseSnapshot?.fingerprint ?? null,
      },
  )
  const [proposal, setProposal] = useState(saved?.proposal ?? run.proposal)
  const [discardOpen, setDiscardOpen] = useState(false)
  const dirty = JSON.stringify(proposal) !== JSON.stringify(baseline.proposal)
  const blocker = useBlocker(dirty)
  useEffect(() => {
    writeDraft(editorDraftKey(run.id), dirty ? { proposal, baseline } : null)
  }, [proposal, baseline, dirty, run.id])
  const discard = () => {
    writeDraft(editorDraftKey(run.id), null)
    onClose()
  }
  const edit =
    proposal === null
      ? null
      : taskPlanEditSchema.safeParse({ expectedRevision: baseline.revision, proposal })
  const revisionConflict =
    error instanceof ApiError && error.code === ERROR_CODES.TASK_PLAN_REVISION_CONFLICT
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [dirty])

  if (proposal === null) return <p role="alert">当前运行没有可编辑的提案。</p>
  return (
    <form
      className="task-plan-draft-editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (edit?.success) onSave(edit.data)
      }}
    >
      <header>
        <div>
          <p className="eyebrow">EDITABLE DRAFT · REVISION {baseline.revision}</p>
          <h2>先调整草稿，再单独确认写入</h2>
        </div>
        {baseline.fingerprint ? (
          <span className="task-plan-snapshot">基于快照 {baseline.fingerprint.slice(0, 10)}</span>
        ) : null}
      </header>
      <fieldset disabled={pending} className="task-plan-editor-root">
        {proposal.kind === "capture" ? (
          <CaptureProposalEditor proposal={proposal} onChange={setProposal} />
        ) : proposal.kind === "replan" ? (
          <ReplanProposalEditor
            snapshot={run.baseSnapshot}
            proposal={proposal}
            onChange={setProposal}
          />
        ) : (
          <PlanProposalEditor proposal={proposal} run={run} onChange={setProposal} />
        )}
      </fieldset>
      {!edit?.success ? (
        <p className="inline-error" role="alert">
          请修正空标题、日期、分钟或时间格式后再保存。
        </p>
      ) : null}
      {error ? (
        <div className="task-plan-save-error" role="alert">
          <strong>修改尚未保存</strong>
          <p>{error.message}</p>
          {revisionConflict ? (
            <div className="button-row">
              <Button
                variant="secondary"
                onClick={() => {
                  writeDraft(editorDraftKey(run.id), null)
                  onReload()
                }}
              >
                重新载入并放弃本地调整
              </Button>
              <span>本地调整已保留，可以继续编辑。</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="button-row">
        <Button type="submit" disabled={!edit?.success || !dirty} loading={pending}>
          保存修改
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => (dirty ? setDiscardOpen(true) : onClose())}
        >
          关闭编辑器
        </Button>
      </div>
      {discardOpen ? (
        <DialogSurface
          className="dialog"
          ariaLabel="放弃未保存的提案修改"
          onClose={() => setDiscardOpen(false)}
        >
          <h2>放弃本地修改？</h2>
          <p>服务器草稿不会改变；你在当前编辑器中的调整会丢失。</p>
          <div className="button-row">
            <Button variant="danger" onClick={discard}>
              放弃修改
            </Button>
            <Button onClick={() => setDiscardOpen(false)}>继续编辑</Button>
          </div>
        </DialogSurface>
      ) : null}
      {blocker.state === "blocked" ? (
        <DialogSurface
          className="dialog"
          ariaLabel="未保存的提案修改"
          onClose={() => blocker.reset()}
        >
          <h2>提案修改尚未保存</h2>
          <p>本地草稿已暂存在当前浏览器标签页，再次编辑此运行可恢复。</p>
          <div className="button-row">
            <Button variant="danger" onClick={() => blocker.proceed()}>
              保留草稿并离开
            </Button>
            <Button onClick={() => blocker.reset()}>继续编辑</Button>
          </div>
        </DialogSurface>
      ) : null}
    </form>
  )
}
