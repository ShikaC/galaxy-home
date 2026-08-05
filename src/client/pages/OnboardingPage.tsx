import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PlugZap, Sparkles } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { workspaceSettingsSchema } from "../../shared/settings.js"
import { Button } from "../components/ui/Button.js"
import { TextField } from "../components/ui/Field.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { aiStatusSchema } from "../lib/schemas.js"

const aiTestResultSchema = z.object({ message: z.string() })

export function OnboardingPage() {
  const client = useQueryClient()
  const [workspaceName, setWorkspaceName] = useState("我的空间")
  const [aiNickname, setAiNickname] = useState("星伴")
  const [userName, setUserName] = useState("你")
  const [chatBaseUrl, setChatBaseUrl] = useState("")
  const [chatModel, setChatModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [transcriptionBaseUrl, setTranscriptionBaseUrl] = useState("")
  const [transcriptionModel, setTranscriptionModel] = useState("")
  const onboarding = useMutation({
    mutationFn: () =>
      apiRequest("/api/onboarding", workspaceSettingsSchema, {
        method: "POST",
        body: jsonBody({ workspaceName, aiNickname, userName, timezone: "Asia/Shanghai" }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  const testAi = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/ai/config", aiStatusSchema, {
        method: "PUT",
        body: jsonBody({
          chatBaseUrl,
          chatModel,
          apiKey,
          transcriptionBaseUrl,
          transcriptionModel,
        }),
      })
      return apiRequest("/api/ai/test", aiTestResultSchema, { method: "POST" })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  const canTestAi = Boolean(chatBaseUrl.trim() && chatModel.trim() && apiKey.trim())
  return (
    <main className="onboarding">
      <section className="onboarding__panel" aria-labelledby="welcome-title">
        <span className="brand-mark">
          <Sparkles size={20} />
        </span>
        <div>
          <p className="eyebrow">首次设置</p>
          <h1 id="welcome-title">欢迎来到银河居所</h1>
          <p className="muted">先为这片个人空间取个名字。AI 服务可以跳过，也可以现在保存并测试。</p>
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
          <section aria-labelledby="onboarding-ai-title" className="onboarding__optional">
            <div>
              <h2 id="onboarding-ai-title">可选：配置并测试 AI 服务</h2>
              <p className="muted onboarding__optional-note">
                需要时再填写。保存后仍可在设置中修改，API Key 只保存在本机。
              </p>
            </div>
            <div className="form-grid">
              <TextField
                label="聊天服务地址"
                onChange={(event) => setChatBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                type="url"
                value={chatBaseUrl}
              />
              <TextField
                label="聊天模型"
                onChange={(event) => setChatModel(event.target.value)}
                placeholder="model-name"
                value={chatModel}
              />
            </div>
            <TextField
              label="API Key"
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              value={apiKey}
            />
            <div className="form-grid">
              <TextField
                label="转写服务地址（可选）"
                onChange={(event) => setTranscriptionBaseUrl(event.target.value)}
                placeholder="默认可与聊天服务相同"
                type="url"
                value={transcriptionBaseUrl}
              />
              <TextField
                label="转写模型（可选）"
                onChange={(event) => setTranscriptionModel(event.target.value)}
                placeholder="whisper-1"
                value={transcriptionModel}
              />
            </div>
            <div className="button-row">
              <Button
                disabled={!canTestAi}
                loading={testAi.isPending}
                onClick={() => testAi.mutate()}
                type="button"
                variant="secondary"
              >
                <PlugZap aria-hidden="true" size={16} />
                保存并测试 AI 服务
              </Button>
              {testAi.isSuccess ? (
                <span className="success-text">{testAi.data.message}</span>
              ) : null}
            </div>
            {testAi.isError ? <p className="inline-error">{testAi.error.message}</p> : null}
          </section>
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
