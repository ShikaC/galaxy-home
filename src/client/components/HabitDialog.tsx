import { useMutation, useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { useState } from "react"
import { apiRequest, jsonBody } from "../lib/api.js"
import { habitSchema } from "../lib/schemas.js"
import { Button } from "./ui/Button.js"
import { TextField } from "./ui/Field.js"
import { IconButton } from "./ui/IconButton.js"

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const

export function HabitDialog({
  onClose,
  open,
}: {
  readonly onClose: () => void
  readonly open: boolean
}) {
  const client = useQueryClient()
  const [name, setName] = useState("")
  const [type, setType] = useState<"check" | "count">("check")
  const [target, setTarget] = useState(1)
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily")
  const [weeklyTarget, setWeeklyTarget] = useState(3)
  const [restDays, setRestDays] = useState<readonly number[]>([])
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/habits", habitSchema, {
        method: "POST",
        body: jsonBody({
          name,
          type,
          targetCount: type === "check" ? 1 : target,
          frequencyType: frequency,
          weeklyTarget: frequency === "weekly" ? weeklyTarget : null,
          restDays,
        }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["habits"] })
      onClose()
    },
  })
  if (!open) return null
  const toggleRest = (day: number) =>
    setRestDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    )
  return (
    <div className="overlay" role="presentation">
      <section aria-labelledby="new-habit-title" aria-modal="true" className="dialog" role="dialog">
        <header className="dialog__header">
          <div>
            <p className="eyebrow">新习惯</p>
            <h2 id="new-habit-title">设定一种可持续的节奏</h2>
          </div>
          <IconButton label="关闭习惯创建" onClick={onClose}>
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
            label="习惯名称"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <fieldset className="segmented">
            <legend className="sr-only">习惯类型</legend>
            <button aria-pressed={type === "check"} onClick={() => setType("check")} type="button">
              一次完成型
            </button>
            <button aria-pressed={type === "count"} onClick={() => setType("count")} type="button">
              次数目标型
            </button>
          </fieldset>
          {type === "count" ? (
            <TextField
              label="每日目标次数"
              min={1}
              onChange={(event) => setTarget(Number(event.target.value))}
              type="number"
              value={target}
            />
          ) : null}
          <fieldset className="segmented">
            <legend className="sr-only">习惯频率</legend>
            <button
              aria-pressed={frequency === "daily"}
              onClick={() => setFrequency("daily")}
              type="button"
            >
              每日
            </button>
            <button
              aria-pressed={frequency === "weekly"}
              onClick={() => setFrequency("weekly")}
              type="button"
            >
              每周目标
            </button>
          </fieldset>
          {frequency === "weekly" ? (
            <TextField
              label="每周目标天数"
              max={7}
              min={1}
              onChange={(event) => setWeeklyTarget(Number(event.target.value))}
              type="number"
              value={weeklyTarget}
            />
          ) : (
            <fieldset className="weekday-picker">
              <legend>固定休息日</legend>
              {WEEKDAYS.map((day, index) => (
                <label key={day}>
                  <input
                    checked={restDays.includes(index)}
                    onChange={() => toggleRest(index)}
                    type="checkbox"
                  />
                  <span>{day}</span>
                </label>
              ))}
            </fieldset>
          )}
          {create.isError ? <p className="inline-error">{create.error.message}</p> : null}
          <footer className="dialog__actions">
            <Button onClick={onClose} variant="ghost">
              取消
            </Button>
            <Button disabled={!name.trim()} loading={create.isPending} type="submit">
              创建习惯
            </Button>
          </footer>
        </form>
      </section>
    </div>
  )
}
