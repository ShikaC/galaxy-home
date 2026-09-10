import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, BookOpen, History, Plus, Sparkles } from "lucide-react"
import { useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import {
  type PlanInput,
  type PlanRun,
  planInputSchema,
  planRunSchema,
  planRunsSchema,
} from "../../shared/planning.js"
import { useAppTime } from "../components/AppContext.js"
import { PageHeader } from "../components/PageHeader.js"
import { PlanRunDetail, planStatusLabel } from "../components/planning/PlanRunDetail.js"
import { Button } from "../components/ui/Button.js"
import { TextArea, TextField } from "../components/ui/Field.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { useMeta } from "../lib/queries.js"

export function PlansPage() {
  const { today } = useAppTime()
  const meta = useMeta()
  const cache = useQueryClient()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get("run")
  const [goal, setGoal] = useState(params.get("goal") ?? "")
  const [dailyMinutes, setDailyMinutes] = useState("45")
  const [horizonDays, setHorizonDays] = useState("1")
  const [startDate, setStartDate] = useState(today)
  const [includeKnowledge, setIncludeKnowledge] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const requestRef = useRef<PlanInput | null>(null)
  const canReadWorkspace = meta.data?.settings.aiPermission === "open"
  const history = useQuery({
    queryKey: ["plans"],
    queryFn: () => apiRequest("/api/plans", planRunsSchema),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === "planning") ? 2000 : false,
  })
  const detail = useQuery({
    queryKey: ["plan", selectedId],
    enabled: selectedId !== null,
    queryFn: () => apiRequest(`/api/plans/${selectedId}`, planRunSchema),
    refetchInterval: (query) => (query.state.data?.status === "planning" ? 2000 : false),
  })
  const receiveRun = async (run: PlanRun) => {
    cache.setQueryData(["plan", run.id], run)
    setParams({ run: run.id })
    await cache.invalidateQueries({ queryKey: ["plans"] })
  }
  const generate = useMutation({
    mutationFn: (input: PlanInput) =>
      apiRequest("/api/plans", planRunSchema, { method: "POST", body: jsonBody(input) }),
    onSuccess: receiveRun,
  })
  const act = useMutation({
    mutationFn: ({ id, action }: { readonly id: string; readonly action: "confirm" | "cancel" }) =>
      apiRequest(`/api/plans/${id}/${action}`, planRunSchema, { method: "POST" }),
    onSuccess: async (run) => {
      await receiveRun(run)
      await cache.invalidateQueries({ queryKey: ["items"] })
    },
    onError: async () => {
      await cache.invalidateQueries({ queryKey: ["plan", selectedId] })
      await cache.invalidateQueries({ queryKey: ["plans"] })
    },
  })
  const revise = (run?: PlanRun) => {
    if (run) {
      setGoal(run.input.goal)
      setDailyMinutes(String(run.input.dailyMinutes))
      setHorizonDays(String(run.input.horizonDays))
      setStartDate(run.input.startDate)
      setIncludeKnowledge(run.input.contextMode === "workspace")
    }
    setParams({})
    generate.reset()
    act.reset()
    requestRef.current = null
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  const input = planInputSchema.safeParse({
    requestId: requestRef.current?.requestId ?? crypto.randomUUID(),
    goal,
    dailyMinutes: Number(dailyMinutes),
    horizonDays: Number(horizonDays),
    startDate,
    contextMode: includeKnowledge && canReadWorkspace ? "workspace" : "goal_only",
  })
  const error = generate.error ?? act.error ?? detail.error
  return (
    <div className="page plans-page">
      <PageHeader
        eyebrow="FROM KNOWLEDGE TO ACTION"
        title="AI 行动计划"
        subtitle="把零散的知识变成做得完的下一步。每一次安排，都由你确认。"
        actions={
          <Button variant="secondary" onClick={() => revise()}>
            <Plus size={16} />
            新计划
          </Button>
        }
      />
      <div className="plans-layout">
        <aside className="plan-history" aria-label="计划历史">
          <h2>
            <History size={16} />
            最近计划
          </h2>
          {history.isLoading ? <p role="status">正在读取记录…</p> : null}
          {history.error ? <p role="alert">{history.error.message}</p> : null}
          {history.data?.length === 0 ? (
            <p>你的计划和执行结果会保存在这里，随时回来继续。</p>
          ) : null}
          {history.data?.map((run) => (
            <button
              type="button"
              key={run.id}
              aria-current={selectedId === run.id ? "true" : undefined}
              onClick={() => {
                setParams({ run: run.id })
                act.reset()
                generate.reset()
              }}
            >
              <strong>{run.input.goal}</strong>
              <span>
                {planStatusLabel[run.status]} · {run.input.startDate}
              </span>
            </button>
          ))}
        </aside>
        <div className="plan-workbench">
          {error ? (
            <p className="inline-error" role="alert">
              {error.message}
            </p>
          ) : null}
          {selectedId === null ? (
            <form
              className="plan-composer"
              onSubmit={(event) => {
                event.preventDefault()
                if (!input.success) return
                const previous = requestRef.current
                const request =
                  previous &&
                  JSON.stringify({ ...previous, requestId: "" }) ===
                    JSON.stringify({ ...input.data, requestId: "" })
                    ? previous
                    : { ...input.data, requestId: crypto.randomUUID() }
                requestRef.current = request
                generate.mutate(request)
              }}
            >
              <div className="plan-composer__intro">
                <span className="ai-emblem">
                  <Sparkles size={22} />
                </span>
                <div>
                  <h2>今天，想把什么向前推进？</h2>
                  <p>描述你想得到的成果，再留出一段真实可用的时间。</p>
                </div>
              </div>
              <TextArea
                ref={inputRef}
                label="想推进的目标"
                value={goal}
                maxLength={2000}
                minLength={4}
                required
                rows={4}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="根据作品集相关笔记，安排一个能完成的案例提纲。优先复用已有任务。"
              />
              <div className="plan-controls">
                <TextField
                  label="开始日期"
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
                <TextField
                  label="计划天数"
                  type="number"
                  min={1}
                  max={7}
                  required
                  value={horizonDays}
                  onChange={(event) => setHorizonDays(event.target.value)}
                />
                <TextField
                  label="每天可用分钟"
                  type="number"
                  min={5}
                  max={480}
                  required
                  value={dailyMinutes}
                  onChange={(event) => setDailyMinutes(event.target.value)}
                />
              </div>
              <div className="plan-knowledge">
                <BookOpen size={17} aria-hidden="true" />
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeKnowledge && canReadWorkspace}
                      disabled={!canReadWorkspace}
                      onChange={(event) => setIncludeKnowledge(event.target.checked)}
                    />
                    参考相关笔记与未完成任务
                  </label>
                  <p>
                    {canReadWorkspace ? (
                      "本次会将最多 6 篇相关笔记片段和 80 项任务标题发送给你配置的模型。"
                    ) : (
                      <>
                        当前为保守模式，仅使用本次目标。
                        <Link to="/settings?section=ai">在设置中管理 AI 权限</Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <footer>
                <p>先生成建议，确认后才会安排任务。</p>
                <Button type="submit" loading={generate.isPending} disabled={!input.success}>
                  <Sparkles size={16} />
                  {generate.isPending ? "正在检索与规划…" : "生成行动计划"}
                </Button>
              </footer>
              {generate.isPending ? (
                <p role="status">正在生成并检查时间、引用和重复任务。最多自动修正一次，请稍候。</p>
              ) : null}
            </form>
          ) : detail.data ? (
            <PlanRunDetail
              run={detail.data}
              pending={act.isPending}
              onConfirm={() => act.mutate({ id: detail.data.id, action: "confirm" })}
              onCancel={() => act.mutate({ id: detail.data.id, action: "cancel" })}
              onRevise={() => revise(detail.data)}
            />
          ) : detail.isLoading ? (
            <p role="status">正在打开计划…</p>
          ) : null}
          {selectedId === null ? (
            <div className="plan-method">
              <span>01 找到依据</span>
              <ArrowRight size={14} />
              <span>02 留出时间</span>
              <ArrowRight size={14} />
              <span>03 确认安排</span>
              <ArrowRight size={14} />
              <span>04 核验结果</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
