import { Maximize2, Pause, Play, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"

const timerSchema = z.object({
  duration: z.number().min(60).max(7200),
  remaining: z.number().min(0).max(7200),
  deadline: z.number().nullable(),
})
const initialTimer = { duration: 1500, remaining: 1500, deadline: null }
const storageKey = "galaxy:focus-timer"
function readTimer(): z.infer<typeof timerSchema> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return initialTimer
    const parsed = timerSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : initialTimer
  } catch (error) {
    if (error instanceof Error) return initialTimer
    throw error
  }
}

export function FocusTimer() {
  const [timer, setTimer] = useState(readTimer)
  const [now, setNow] = useState(Date.now)
  const [expanded, setExpanded] = useState(false)
  const remaining =
    timer.deadline === null
      ? timer.remaining
      : Math.max(0, Math.ceil((timer.deadline - now) / 1000))
  const running = timer.deadline !== null && remaining > 0
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(timer))
    } catch (error) {
      if (!(error instanceof Error)) throw error
    }
  }, [timer])
  useEffect(() => {
    if (timer.deadline === null) return
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [timer.deadline])
  useEffect(() => {
    if (remaining === 0 && timer.deadline !== null)
      setTimer((current) => ({ ...current, deadline: null, remaining: 0 }))
  }, [remaining, timer.deadline])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false)
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [])
  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0")
  const seconds = String(remaining % 60).padStart(2, "0")
  const widget = (
    <section
      className={`focus-widget${expanded ? " focus-widget--expanded" : ""}`}
      aria-label="专注计时"
    >
      <header>
        <span>
          <span className="live-dot" /> DEEP WORK
        </span>
        <IconButton
          label={expanded ? "缩小专注计时" : "放大专注计时"}
          onClick={() => setExpanded(!expanded)}
        >
          <Maximize2 size={15} />
        </IconButton>
      </header>
      <h2>一次，只做一件事。</h2>
      <p>把这段时间，留给真正重要的事。</p>
      <div className="focus-clock" role="timer" aria-label={`剩余 ${minutes} 分 ${seconds} 秒`}>
        {minutes}
        <span>:</span>
        {seconds}
      </div>
      <fieldset className="focus-durations" aria-label="专注时长">
        {[25, 50].map((duration) => (
          <button
            key={duration}
            type="button"
            aria-pressed={timer.duration === duration * 60}
            disabled={running}
            onClick={() =>
              setTimer({ duration: duration * 60, remaining: duration * 60, deadline: null })
            }
          >
            {duration} 分钟
          </button>
        ))}
      </fieldset>
      <div className="focus-controls">
        <button
          type="button"
          className="focus-start"
          onClick={() => {
            const timestamp = Date.now()
            setNow(timestamp)
            setTimer((current) =>
              running
                ? { ...current, deadline: null, remaining }
                : {
                    ...current,
                    remaining: remaining || current.duration,
                    deadline: timestamp + (remaining || current.duration) * 1000,
                  },
            )
          }}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running
            ? "暂停专注"
            : remaining === 0
              ? "再来一轮"
              : remaining < timer.duration
                ? "继续专注"
                : "开始专注"}
        </button>
        <IconButton
          label="重置专注计时"
          onClick={() =>
            setTimer((current) => ({ ...current, remaining: current.duration, deadline: null }))
          }
        >
          <RotateCcw size={16} />
        </IconButton>
      </div>
      {remaining === 0 ? <p role="status">这一轮完成了，站起来放松一下吧。</p> : null}
    </section>
  )
  return expanded ? (
    <DialogSurface
      ariaLabel="专注模式"
      className="focus-dialog dialog"
      onClose={() => setExpanded(false)}
    >
      {widget}
    </DialogSurface>
  ) : (
    widget
  )
}
