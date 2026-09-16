import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router"
import {
  type TaskPlanInput,
  type TaskPlanProposal,
  type TaskPlanRun,
  taskPlanRunSchema,
  taskPlanRunsSchema,
} from "../../shared/taskPlanning.js"
import { useAppTime } from "../components/AppContext.js"
import { PageHeader } from "../components/PageHeader.js"
import { editorDraftKey, writeDraft } from "../components/taskPlanning/draftStorage.js"
import { TaskPlanDraftEditor } from "../components/taskPlanning/TaskPlanDraftEditor.js"
import { TaskPlanningComposer } from "../components/taskPlanning/TaskPlanningComposer.js"
import { TaskPlanningRunDetail } from "../components/taskPlanning/TaskPlanningRunDetail.js"
import { TaskPlanRunList } from "../components/taskPlanning/TaskPlanRunList.js"
import { Button } from "../components/ui/Button.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import "../styles/task-planning.css"

const runKey = (id: string | null) => ["task-plan", id] as const

export function TaskPlanningPage() {
  const { timezone, today } = useAppTime()
  const cache = useQueryClient()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get("run")
  const requestedMode = params.get("mode")
  const mode = requestedMode === "replan" || requestedMode === "plan" ? requestedMode : "capture"
  const [editing, setEditing] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const history = useQuery({
    queryKey: ["task-plans"],
    queryFn: ({ signal }) => apiRequest("/api/task-plans", taskPlanRunsSchema, { signal }),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === "planning") ? 2_000 : false,
  })
  const detail = useQuery({
    queryKey: runKey(selectedId),
    enabled: selectedId !== null,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiRequest(`/api/task-plans/${selectedId}`, taskPlanRunSchema, { signal }),
    refetchInterval: (query) => (query.state.data?.status === "planning" ? 2_000 : false),
  })
  const receiveRun = async (run: TaskPlanRun) => {
    cache.setQueryData(runKey(run.id), run)
    if (selectedId !== run.id) setParams({ run: run.id, mode: run.input.type })
    await cache.invalidateQueries({ queryKey: ["task-plans"] })
  }
  const create = useMutation({
    mutationFn: (input: TaskPlanInput) =>
      apiRequest("/api/task-plans", taskPlanRunSchema, {
        method: "POST",
        headers: { Prefer: "respond-async" },
        body: jsonBody(input),
      }),
    onSuccess: receiveRun,
  })
  const save = useMutation({
    mutationFn: ({
      id,
      expectedRevision,
      proposal,
    }: {
      readonly id: string
      readonly expectedRevision: number
      readonly proposal: TaskPlanProposal
    }) =>
      apiRequest(`/api/task-plans/${id}`, taskPlanRunSchema, {
        method: "PATCH",
        body: jsonBody({ expectedRevision, proposal }),
      }),
    onSuccess: async (run) => {
      writeDraft(editorDraftKey(run.id), null)
      await receiveRun(run)
      setEditing(false)
    },
  })
  const confirm = useMutation({
    mutationFn: ({
      id,
      expectedRevision,
    }: {
      readonly id: string
      readonly expectedRevision: number
    }) =>
      apiRequest(`/api/task-plans/${id}/confirm`, taskPlanRunSchema, {
        method: "POST",
        body: jsonBody({ expectedRevision }),
      }),
    onSuccess: async (run) => {
      await receiveRun(run)
      await cache.invalidateQueries({ queryKey: ["items"] })
      await cache.invalidateQueries({ queryKey: ["calendar"] })
    },
  })
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await cache.cancelQueries({ queryKey: runKey(id) })
      return apiRequest(`/api/task-plans/${id}/cancel`, taskPlanRunSchema, { method: "POST" })
    },
    onSuccess: async (run) => {
      await cache.cancelQueries({ queryKey: runKey(run.id) })
      cache.setQueryData(runKey(run.id), run)
      await history.refetch()
    },
  })
  const visibleRun = detail.data
  const select = (id: string) => {
    setEditing(false)
    save.reset()
    confirm.reset()
    setParams({ run: id, mode })
  }
  const newRun = () => {
    setEditing(false)
    create.reset()
    save.reset()
    confirm.reset()
    setParams({ mode })
  }
  const reloadEditor = () => {
    void detail.refetch().then(() => setEditorKey((value) => value + 1))
  }
  return (
    <div className="page task-planning-page">
      <PageHeader
        eyebrow="CAPTURE · REVIEW · VERIFY"
        title="AI 任务规划"
        subtitle="把自然语言变成可修改的任务，或按真实容量重排日历。每次写入都先看清变化，再由你确认。"
        actions={
          <Button variant="secondary" onClick={newRun}>
            <Plus size={16} /> 新运行
          </Button>
        }
      />
      <div className="task-planning-layout">
        <TaskPlanRunList
          loading={history.isLoading}
          error={history.error}
          runs={history.data ?? []}
          selectedId={selectedId}
          onSelect={select}
        />
        <section className="task-planning-workbench" aria-label="AI 任务工作区">
          {selectedId === null ? (
            <TaskPlanningComposer
              mode={mode}
              today={today}
              timezone={timezone}
              startDate={params.get("startDate") ?? undefined}
              endDate={params.get("endDate") ?? undefined}
              workStart={params.get("workStart") ?? undefined}
              workEnd={params.get("workEnd") ?? undefined}
              pending={create.isPending}
              error={create.error}
              onModeChange={(next) => setParams({ mode: next })}
              onSubmit={(input) => create.mutate(input)}
            />
          ) : null}
          {selectedId !== null && detail.isLoading ? <p role="status">正在打开运行记录…</p> : null}
          {selectedId !== null && detail.error ? (
            <p className="inline-error" role="alert">
              {detail.error.message}
            </p>
          ) : null}
          {visibleRun && editing ? (
            <TaskPlanDraftEditor
              key={`${visibleRun.id}-${editorKey}`}
              run={visibleRun}
              pending={save.isPending}
              error={save.error}
              onSave={(edit) => save.mutate({ id: visibleRun.id, ...edit })}
              onClose={() => {
                setEditing(false)
                save.reset()
              }}
              onReload={reloadEditor}
            />
          ) : null}
          {visibleRun && !editing ? (
            <TaskPlanningRunDetail
              key={visibleRun.id}
              today={today}
              run={visibleRun}
              onRefresh={() => {
                void detail.refetch()
                confirm.reset()
              }}
              pending={confirm.isPending || cancel.isPending || create.isPending}
              onEdit={() => {
                save.reset()
                setEditing(true)
              }}
              onCancel={() => cancel.mutate(visibleRun.id)}
              onConfirm={() =>
                confirm.mutate({ id: visibleRun.id, expectedRevision: visibleRun.draftRevision })
              }
              onRetry={(input) => create.mutate(input)}
            />
          ) : null}
          {confirm.error ? (
            <p className="inline-error" role="alert">
              {confirm.error.message} 提案与原始输入仍保留，请重新载入后检查。
            </p>
          ) : null}
          {create.error && selectedId !== null ? (
            <p className="inline-error" role="alert">
              {create.error.message} 原始输入和补充说明仍保留。
            </p>
          ) : null}
          {cancel.error ? (
            <p className="inline-error" role="alert">
              {cancel.error.message}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
