import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { workspaceSettingsSchema } from "../../shared/settings.js"
import { Button } from "../components/ui/Button.js"
import { TextField } from "../components/ui/Field.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

export function ProfileSettings() {
  const meta = useMeta()
  const client = useQueryClient()
  const [workspaceName, setWorkspaceName] = useState("")
  const [aiNickname, setAiNickname] = useState("")
  const [userName, setUserName] = useState("")
  const [timezone, setTimezone] = useState("Asia/Shanghai")
  useEffect(() => {
    if (meta.data) {
      setWorkspaceName(meta.data.settings.workspaceName)
      setAiNickname(meta.data.settings.aiNickname)
      setUserName(meta.data.settings.userName)
      setTimezone(meta.data.settings.timezone)
    }
  }, [meta.data])
  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/settings", workspaceSettingsSchema, {
        method: "PATCH",
        body: jsonBody({ workspaceName, aiNickname, userName, timezone }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.meta })
      void client.invalidateQueries({ queryKey: ["items"] })
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: ["habit-day"] })
      void client.invalidateQueries({ queryKey: ["habit-summaries"] })
      void client.invalidateQueries({ queryKey: ["gains"] })
      void client.invalidateQueries({ queryKey: ["quote"] })
      void client.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
  return (
    <section className="settings-section">
      <header>
        <h2>个人空间</h2>
        <p>空间名称、AI 昵称与你的称呼都可随时修改，不限于首次引导。</p>
      </header>
      <form
        className="form-stack settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <TextField
          label="个人空间名称"
          onChange={(event) => setWorkspaceName(event.target.value)}
          value={workspaceName}
        />
        <div className="form-grid">
          <TextField
            label="AI 助手昵称"
            onChange={(event) => setAiNickname(event.target.value)}
            value={aiNickname}
          />
          <TextField
            label="AI 对你的称呼"
            onChange={(event) => setUserName(event.target.value)}
            value={userName}
          />
        </div>
        <label className="field">
          <span className="field__label">时区</span>
          <select
            className="field__control"
            onChange={(event) => setTimezone(event.target.value)}
            value={timezone}
          >
            <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="Europe/London">Europe/London</option>
            <option value="America/New_York">America/New_York</option>
          </select>
          <span className="field__hint">切换时区后，「今日」与习惯日界会按新区计算；历史日期键不会自动迁移。</span>
        </label>
        <div>
          <Button disabled={!workspaceName.trim()} loading={save.isPending} type="submit">
            保存个人设置
          </Button>
          {save.isSuccess ? <span className="success-text">已保存</span> : null}
        </div>
      </form>
    </section>
  )
}
