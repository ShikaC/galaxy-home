import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { workspaceSettingsSchema } from "../../shared/settings.js"
import { Button } from "../components/ui/Button.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

export function ReminderSettings() {
  const meta = useMeta()
  const client = useQueryClient()
  const [morningTime, setMorningTime] = useState("09:00")
  const [morning, setMorning] = useState(true)
  const [eveningTime, setEveningTime] = useState("21:00")
  const [evening, setEvening] = useState(true)
  const [weeklyTime, setWeeklyTime] = useState("20:00")
  const [weekly, setWeekly] = useState(true)
  useEffect(() => {
    if (meta.data) {
      const value = meta.data.settings
      setMorningTime(value.morningReminderTime)
      setMorning(value.morningReminderEnabled)
      setEveningTime(value.eveningReminderTime)
      setEvening(value.eveningReminderEnabled)
      setWeeklyTime(value.weeklyReviewTime)
      setWeekly(value.weeklyReviewEnabled)
    }
  }, [meta.data])
  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/settings", workspaceSettingsSchema, {
        method: "PATCH",
        body: jsonBody({
          morningReminderTime: morningTime,
          morningReminderEnabled: morning,
          eveningReminderTime: eveningTime,
          eveningReminderEnabled: evening,
          weeklyReviewTime: weeklyTime,
          weeklyReviewEnabled: weekly,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  return (
    <section className="settings-section">
      <header>
        <h2>提醒</h2>
        <p>浏览器运行期间显示；关闭期间错过的提醒会在下次启动补显示。</p>
      </header>
      <form
        className="reminder-list"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <label>
          <input
            checked={morning}
            onChange={(event) => setMorning(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>早间确认</strong>
            <small>选择今天最想推进的内容</small>
          </span>
          <input
            disabled={!morning}
            onChange={(event) => setMorningTime(event.target.value)}
            type="time"
            value={morningTime}
          />
        </label>
        <label>
          <input
            checked={evening}
            onChange={(event) => setEvening(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>晚间收获</strong>
            <small>回看今天值得留下的内容</small>
          </span>
          <input
            disabled={!evening}
            onChange={(event) => setEveningTime(event.target.value)}
            type="time"
            value={eveningTime}
          />
        </label>
        <label>
          <input
            checked={weekly}
            onChange={(event) => setWeekly(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>周日回顾</strong>
            <small>生成周一至周日的回顾</small>
          </span>
          <input
            disabled={!weekly}
            onChange={(event) => setWeeklyTime(event.target.value)}
            type="time"
            value={weeklyTime}
          />
        </label>
        <div>
          <Button loading={save.isPending} type="submit">
            保存提醒
          </Button>
        </div>
      </form>
    </section>
  )
}
