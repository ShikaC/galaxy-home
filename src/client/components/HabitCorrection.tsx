import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { apiVoid, jsonBody } from "../lib/api.js"
import { useHabits } from "../lib/queries.js"
import { useAppTime } from "./AppContext.js"
import { Button } from "./ui/Button.js"
import { TextField } from "./ui/Field.js"

export function HabitCorrection({ initialDate }: { readonly initialDate?: string }) {
  const { today } = useAppTime()
  const habits = useHabits()
  const client = useQueryClient()
  const [habitId, setHabitId] = useState("")
  const [date, setDate] = useState(initialDate ?? today)
  const [count, setCount] = useState(0)
  const [leave, setLeave] = useState(false)
  useEffect(() => setDate(initialDate ?? today), [initialDate, today])
  useEffect(() => {
    if (
      habitId !== "" &&
      habits.data !== undefined &&
      !habits.data.some((habit) => habit.id === habitId)
    ) {
      setHabitId("")
    }
  }, [habitId, habits.data])
  const save = useMutation({
    mutationFn: () =>
      apiVoid("/api/habit-logs", {
        method: "PUT",
        body: jsonBody({
          habitId,
          localDate: date,
          count,
          status: leave ? "leave" : "active",
          corrected: true,
        }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: ["habit-day"] })
      void client.invalidateQueries({ queryKey: ["habit-summaries"] })
    },
  })
  return (
    <form
      className="correction-form"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <label className="field">
        <span className="field__label">习惯</span>
        <select
          className="field__control"
          onChange={(event) => setHabitId(event.target.value)}
          value={habitId}
        >
          <option value="">选择习惯</option>
          {habits.data
            ?.filter((habit) => !habit.isTutorial)
            .map((habit) => (
              <option key={habit.id} value={habit.id}>
                {habit.name}
              </option>
            ))}
        </select>
      </label>
      <TextField
        label="日期"
        max={today}
        onChange={(event) => setDate(event.target.value)}
        type="date"
        value={date}
      />
      <TextField
        disabled={leave}
        label="完成次数"
        min={0}
        onChange={(event) => setCount(Number(event.target.value))}
        type="number"
        value={count}
      />
      <label className="check-line">
        <input
          checked={leave}
          onChange={(event) => setLeave(event.target.checked)}
          type="checkbox"
        />
        临时请假
      </label>
      <Button disabled={!habitId} loading={save.isPending} size="compact" type="submit">
        保存修正
      </Button>
      {save.isSuccess ? <span className="success-text">已标记为修正记录</span> : null}
    </form>
  )
}
