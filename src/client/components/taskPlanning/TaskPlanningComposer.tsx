import { CalendarClock, FileText, Inbox, Sparkles } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { type TaskPlanInput, taskPlanInputSchema } from "../../../shared/taskPlanning.js"
import { Button } from "../ui/Button.js"
import { TextArea, TextField } from "../ui/Field.js"
import { readDraft, writeDraft } from "./draftStorage.js"

const composerDraftSchema = z.object({
  originalText: z.string(),
  // plan 模式（原知识计划）的字段；带默认值以便读取旧的草稿。
  goal: z.string().default(""),
  horizonDays: z.number().int().min(1).max(7).default(3),
  contextMode: z.enum(["goal_only", "workspace"]).default("workspace"),
  startDate: z.string(),
  endDate: z.string(),
  workStart: z.string(),
  workEnd: z.string(),
  requestId: z.uuid(),
  identity: z.string(),
})
const composerKey = "galaxy-task-plan-composer"

type Mode = TaskPlanInput["type"]

function nextWeek(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 7)
  return value.toISOString().slice(0, 10)
}

export function TaskPlanningComposer({
  error,
  mode,
  onModeChange,
  onSubmit,
  pending,
  startDate: initialStartDate,
  endDate: initialEndDate,
  workStart: initialWorkStart,
  workEnd: initialWorkEnd,
  timezone,
  today,
}: {
  readonly error: Error | null
  readonly mode: Mode
  readonly onModeChange?: (mode: Mode) => void
  readonly onSubmit: (input: TaskPlanInput) => void
  readonly pending: boolean
  readonly endDate?: string | undefined
  readonly workStart?: string | undefined
  readonly workEnd?: string | undefined
  readonly startDate?: string | undefined
  readonly timezone: string
  readonly today: string
}) {
  const [saved] = useState(() => readDraft(composerKey, composerDraftSchema))
  const [originalText, setOriginalText] = useState(saved?.originalText ?? "")
  const [goal, setGoal] = useState(saved?.goal ?? "")
  const [horizonDays, setHorizonDays] = useState(saved?.horizonDays ?? 3)
  const [contextMode, setContextMode] = useState<"goal_only" | "workspace">(
    saved?.contextMode ?? "workspace",
  )
  const [startDate, setStartDate] = useState(initialStartDate ?? saved?.startDate ?? today)
  const [endDate, setEndDate] = useState(
    initialEndDate ??
      (initialStartDate ? nextWeek(initialStartDate) : (saved?.endDate ?? nextWeek(today))),
  )
  const [workStart, setWorkStart] = useState(initialWorkStart ?? saved?.workStart ?? "09:00")
  const [workEnd, setWorkEnd] = useState(initialWorkEnd ?? saved?.workEnd ?? "18:00")
  const request = useRef({
    id: saved?.requestId ?? crypto.randomUUID(),
    identity: saved?.identity ?? "",
  })
  const identity = JSON.stringify({
    mode,
    originalText,
    goal,
    horizonDays,
    contextMode,
    startDate,
    endDate,
    workStart,
    workEnd,
    today,
    timezone,
  })
  useEffect(() => {
    writeDraft(composerKey, {
      originalText,
      goal,
      horizonDays,
      contextMode,
      startDate,
      endDate,
      workStart,
      workEnd,
      requestId: request.current.id,
      identity: request.current.identity,
    })
  }, [originalText, goal, horizonDays, contextMode, startDate, endDate, workStart, workEnd])
  const candidate =
    mode === "capture"
      ? taskPlanInputSchema.safeParse({
          type: "capture",
          requestId: request.current.id,
          originalText,
          referenceDate: today,
          timezone,
        })
      : mode === "plan"
        ? taskPlanInputSchema.safeParse({
            type: "plan",
            requestId: request.current.id,
            goal,
            // 计划从今天起算，因此不需要用户再选开始日期。
            startDate: today,
            horizonDays,
            contextMode,
          })
        : taskPlanInputSchema.safeParse({
            type: "replan",
            requestId: request.current.id,
            originalText,
            startDate,
            endDate,
            timezone,
            workWindow: [1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              startTime: workStart,
              endTime: workEnd,
            })),
            lockedItemIds: [],
          })
  const submit = () => {
    if (!candidate.success || pending) return
    if (request.current.identity !== identity)
      request.current = { id: crypto.randomUUID(), identity }
    writeDraft(composerKey, {
      originalText,
      startDate,
      endDate,
      workStart,
      workEnd,
      requestId: request.current.id,
      identity,
    })
    onSubmit({ ...candidate.data, requestId: request.current.id })
  }
  const shortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    submit()
  }

  return (
    <form
      className="task-planning-composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="task-planning-mode" role="tablist" aria-label="AI 任务操作">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "capture"}
          onClick={() => onModeChange?.("capture")}
        >
          <Inbox size={17} /> 自然语言录入
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "replan"}
          onClick={() => onModeChange?.("replan")}
        >
          <CalendarClock size={17} /> 调整日历安排
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "plan"}
          onClick={() => onModeChange?.("plan")}
        >
          <FileText size={17} /> 从笔记做计划
        </button>
      </div>
      <div className="task-planning-intro">
        <span className="ai-emblem">
          <Sparkles size={22} />
        </span>
        <div>
          <h2>
            {mode === "capture"
              ? "把想到的事一次说清"
              : mode === "replan"
                ? "让变化回到可执行的日程"
                : "从已有材料推出下一步"}
          </h2>
          <p>
            {mode === "capture" ? (
              <>
                一次写下任务、截止日期和重复要求。生成后可以
                <span className="task-plan-token">修改草稿。</span>
              </>
            ) : mode === "replan" ? (
              "AI 会读取范围内的真实安排与容量，固定日程不会移动，冲突会明确列出。"
            ) : (
              "AI 会检索工作区笔记与已有任务作为依据，供你确认后再写入。笔记中的指令不会获得执行权限。"
            )}
          </p>
        </div>
      </div>
      <TextArea
        label={mode === "plan" ? "想推进的目标" : "原始记录"}
        aria-label={mode === "plan" ? "想推进的目标" : "原始记录"}
        value={mode === "plan" ? goal : originalText}
        rows={5}
        maxLength={mode === "plan" ? 2_000 : 10_000}
        required
        onChange={(event) =>
          mode === "plan" ? setGoal(event.target.value) : setOriginalText(event.target.value)
        }
        onKeyDown={shortcut}
        placeholder={
          mode === "capture"
            ? "例如：每个工作日检查客户反馈，周五提交方案。"
            : mode === "replan"
              ? "例如：临时增加了周四下午的会议，请调整本周剩余任务，保留固定日程。"
              : "例如：把作品集案例整理成提纲，并补齐验证材料。"
        }
        hint="⌘/Ctrl + Enter 生成预览；中文输入法选词时不会提交。"
      />
      {mode === "plan" ? (
        <div className="task-planning-controls">
          <TextField
            label="规划天数"
            type="number"
            min={1}
            max={7}
            required
            value={horizonDays}
            onChange={(event) => setHorizonDays(event.target.valueAsNumber)}
          />
          <label className="field">
            <span className="field__label">资料范围</span>
            <select
              className="field__control"
              value={contextMode}
              onChange={(event) =>
                setContextMode(event.target.value === "goal_only" ? "goal_only" : "workspace")
              }
            >
              <option value="workspace">读工作区笔记与任务</option>
              <option value="goal_only">只根据本次输入</option>
            </select>
          </label>
        </div>
      ) : null}
      {mode === "replan" ? (
        <div className="task-planning-controls">
          <TextField
            label="开始日期"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <TextField
            label="结束日期（不含当天）"
            type="date"
            required
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <TextField
            label="工作开始"
            type="time"
            required
            value={workStart}
            onChange={(event) => setWorkStart(event.target.value)}
          />
          <TextField
            label="工作结束"
            type="time"
            required
            value={workEnd}
            onChange={(event) => setWorkEnd(event.target.value)}
          />
        </div>
      ) : null}
      {mode === "replan" ? (
        <p className="task-plan-snapshot">
          工作日：周一至周五 · 时区：{timezone} ·
          固定日程和已完成任务自动保护。需额外保护的任务请先在日历中固定。
        </p>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          {error.message} 原始记录仍保留在上方，可修改后重试。
        </p>
      ) : null}
      <footer>
        <p>生成只会建立可编辑草稿；确认前不会写入任务或日历。</p>
        <Button type="submit" loading={pending} disabled={!candidate.success}>
          <Sparkles size={16} /> {pending ? "正在生成预览…" : "生成可编辑预览"}
        </Button>
      </footer>
    </form>
  )
}
