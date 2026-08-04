import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { useState } from "react"
import { workspaceSettingsSchema } from "../../shared/settings.js"
import { Button } from "../components/ui/Button.js"
import { TextField } from "../components/ui/Field.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"

export function OnboardingPage() {
  const client = useQueryClient()
  const [workspaceName, setWorkspaceName] = useState("我的空间")
  const [aiNickname, setAiNickname] = useState("星伴")
  const [userName, setUserName] = useState("你")
  const onboarding = useMutation({
    mutationFn: () =>
      apiRequest("/api/onboarding", workspaceSettingsSchema, {
        method: "POST",
        body: jsonBody({ workspaceName, aiNickname, userName, timezone: "Asia/Shanghai" }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  return (
    <main className="onboarding">
      <section className="onboarding__panel" aria-labelledby="welcome-title">
        <span className="brand-mark">
          <Sparkles size={20} />
        </span>
        <div>
          <p className="eyebrow">首次设置</p>
          <h1 id="welcome-title">欢迎来到银河居所</h1>
          <p className="muted">先为这片个人空间取个名字。AI 服务可以稍后在设置中配置。</p>
        </div>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault()
            onboarding.mutate()
          }}
        >
          <TextField
            autoFocus
            label="个人空间名称"
            maxLength={60}
            onChange={(event) => setWorkspaceName(event.target.value)}
            value={workspaceName}
          />
          <div className="form-grid">
            <TextField
              label="AI 助手昵称"
              maxLength={30}
              onChange={(event) => setAiNickname(event.target.value)}
              value={aiNickname}
            />
            <TextField
              label="AI 对你的称呼"
              maxLength={30}
              onChange={(event) => setUserName(event.target.value)}
              value={userName}
            />
          </div>
          {onboarding.isError ? <p className="inline-error">{onboarding.error.message}</p> : null}
          <Button
            disabled={!workspaceName.trim() || !aiNickname.trim() || !userName.trim()}
            loading={onboarding.isPending}
            type="submit"
          >
            进入我的空间
          </Button>
        </form>
      </section>
    </main>
  )
}
