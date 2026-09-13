import { CalendarClock, Inbox, Sparkles } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { type TaskPlanInput, taskPlanInputSchema } from "../../../shared/taskPlanning.js"
import { Button } from "../ui/Button.js"
import { TextArea, TextField } from "../ui/Field.js"
import { readDraft, writeDraft } from "./draftStorage.js"

const composerDraftSchema = z.object({
  originalText: z.string(),
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
      startDate,
      endDate,
      workStart,
      workEnd,
      requestId: request.current.id,
      identity: request.current.identity,
    })
  }, [originalText, startDate, endDate, workStart, workEnd])
  const candidate =
    mode === "capture"
      ? taskPlanInputSchema.safeParse({
          type: "capture",
          requestId: request.current.id,
          originalText,
          referenceDate: today,
          timezone,
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
      </div>
      <div className="task-planning-intro">
        <span className="ai-emblem">
          <Sparkles size={22} />
        </span>
        <div>
          <h2>{mode === "capture" ? "把想到的事一次说清" : "让变化回到可执行的日程"}</h2>
          <p>
            {mode === "capture" ? (
              <>
                一次写下任务、截止日期和重复要求。生成后可以
                <span className="task-plan-token">修改草稿。</span>
              </>
            ) : (
              "AI 会读取范围内的真实安排与容量，固定日程不会移动，冲突会明确列出。"
            )}
          </p>
        </div>
      </div>
      <TextArea
        label="原始记录"
        aria-label="原始记录"
        value={originalText}
        rows={5}
        maxLength={10_000}
        required
        onChange={(event) => setOriginalText(event.target.value)}
        onKeyDown={shortcut}
        placeholder={
          mode === "capture"
            ? "例如：每个工作日检查客户反馈，周五提交方案。"
            : "例如：临时增加了周四下午的会议，请调整本周剩余任务，保留固定日程。"
        }
        hint="⌘/Ctrl + Enter 生成预览；中文输入法选词时不会提交。"
      />
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
