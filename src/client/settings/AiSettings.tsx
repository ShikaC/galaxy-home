import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import { DEFAULT_AI_PERSONALITY_PROMPT, workspaceSettingsSchema } from "../../shared/settings.js"
import { AiActionLog } from "../components/AiActionLog.js"
import { Button } from "../components/ui/Button.js"
import { TextArea, TextField } from "../components/ui/Field.js"
import { Badge } from "../components/ui/Status.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"
import { aiStatusSchema } from "../lib/schemas.js"

export function AiSettings() {
  const meta = useMeta()
  const client = useQueryClient()
  const [chatBaseUrl, setChatBaseUrl] = useState("")
  const [chatModel, setChatModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [transcriptionBaseUrl, setTranscriptionBaseUrl] = useState("")
  const [transcriptionModel, setTranscriptionModel] = useState("")
  const [personalityPrompt, setPersonalityPrompt] = useState<string>(DEFAULT_AI_PERSONALITY_PROMPT)
  const [aiNickname, setAiNickname] = useState("")
  const [userName, setUserName] = useState("")
  useEffect(() => {
    if (meta.data) {
      setChatBaseUrl(meta.data.ai.chatBaseUrl)
      setChatModel(meta.data.ai.chatModel)
      setTranscriptionBaseUrl(meta.data.ai.transcriptionBaseUrl)
      setTranscriptionModel(meta.data.ai.transcriptionModel)
      setPersonalityPrompt(meta.data.settings.aiPersonalityPrompt)
      setAiNickname(meta.data.settings.aiNickname)
      setUserName(meta.data.settings.userName)
    }
  }, [meta.data])
  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/ai/config", aiStatusSchema, {
        method: "PUT",
        body: jsonBody({
          chatBaseUrl,
          chatModel,
          apiKey,
          transcriptionBaseUrl,
          transcriptionModel,
        }),
      }),
    onSuccess: () => {
      setApiKey("")
      void client.invalidateQueries({ queryKey: queryKeys.meta })
    },
  })
  const test = useMutation({
    mutationFn: () =>
      apiRequest("/api/ai/test", z.object({ message: z.string() }), { method: "POST" }),
  })
  const permission = useMutation({
    mutationFn: (aiPermission: "conservative" | "open") =>
      apiRequest("/api/settings", workspaceSettingsSchema, {
        method: "PATCH",
        body: jsonBody({ aiPermission }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  const savePersonality = useMutation({
    mutationFn: () =>
      apiRequest("/api/settings", workspaceSettingsSchema, {
        method: "PATCH",
        body: jsonBody({ aiPersonalityPrompt: personalityPrompt }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  const saveNames = useMutation({
    mutationFn: () =>
      apiRequest("/api/settings", workspaceSettingsSchema, {
        method: "PATCH",
        body: jsonBody({ aiNickname, userName }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  return (
    <section className="settings-section">
      <header>
        <div>
          <h2>AI 服务与权限</h2>
          <p>API Key 只保存在本机秘密配置中，不进入导出或备份。</p>
        </div>
        <Badge tone={meta.data?.ai.configured ? "positive" : "waiting"}>
          {meta.data?.ai.configured ? "已配置" : "未配置"}
        </Badge>
      </header>
      <fieldset className="segmented">
        <legend className="sr-only">AI 权限模式</legend>
        <button
          aria-pressed={meta.data?.settings.aiPermission === "conservative"}
          onClick={() => permission.mutate("conservative")}
          type="button"
        >
          保守模式
        </button>
        <button
          aria-pressed={meta.data?.settings.aiPermission === "open"}
          onClick={() => permission.mutate("open")}
          type="button"
        >
          开放模式
        </button>
      </fieldset>
      <p className="setting-note">
        保守模式少读本地内容；可创建项目/习惯/待办及更新、完成、今日安排、分类、项目进度等非删除操作，但需你确认后执行，不支持删除或归档。开放模式可读更广：除软删进回收站需你确认外，其余已支持操作（含归档）会立即执行；周日可自动生成
        AI 周报。永久删除、导出和核心目标变更始终需要确认；项目拆解仍在项目页确认。
      </p>
      <form
        className="form-stack settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          saveNames.mutate()
        }}
      >
        <h3>称呼</h3>
        <p className="setting-note">可随时修改，会立刻用于新的对话提示词；也可在「个人空间」中调整。</p>
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
        <div className="button-row">
          <Button
            disabled={aiNickname.trim() === "" || userName.trim() === ""}
            loading={saveNames.isPending}
            type="submit"
          >
            保存称呼
          </Button>
          {saveNames.isSuccess ? <span className="success-text">已保存</span> : null}
        </div>
        {saveNames.isError ? <p className="inline-error">{saveNames.error.message}</p> : null}
      </form>
      <form
        className="form-stack settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          savePersonality.mutate()
        }}
      >
        <h3>性格提示词</h3>
        <p className="setting-note">
          对话时会组合为：「你是{aiNickname.trim() || "助手"}，称呼用户为
          {userName.trim() || "你"}。」+ 下方性格文字。能力边界与诚实规则由应用维护，不可在此修改。
        </p>
        <TextArea
          hint="可写成你希望 AI 如何说话、如何处理拖延与休息的偏好。"
          label="性格与语气"
          onChange={(event) => setPersonalityPrompt(event.target.value)}
          rows={5}
          value={personalityPrompt}
        />
        <div className="button-row">
          <Button
            disabled={personalityPrompt.trim() === ""}
            loading={savePersonality.isPending}
            type="submit"
          >
            保存性格提示词
          </Button>
          <Button
            onClick={() => setPersonalityPrompt(DEFAULT_AI_PERSONALITY_PROMPT)}
            type="button"
            variant="secondary"
          >
            恢复默认
          </Button>
          {savePersonality.isSuccess ? <span className="success-text">已保存</span> : null}
        </div>
        {savePersonality.isError ? (
          <p className="inline-error">{savePersonality.error.message}</p>
        ) : null}
      </form>
      <form
        className="form-stack settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
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
          hint={meta.data?.ai.hasApiKey ? "已保存密钥；留空不会覆盖" : "密钥不会在保存后完整显示"}
          label="API Key"
          onChange={(event) => setApiKey(event.target.value)}
          type="password"
          value={apiKey}
        />
        <div className="form-grid">
          <TextField
            label="转写服务地址"
            onChange={(event) => setTranscriptionBaseUrl(event.target.value)}
            placeholder="默认可与聊天服务相同"
            type="url"
            value={transcriptionBaseUrl}
          />
          <TextField
            label="转写模型"
            onChange={(event) => setTranscriptionModel(event.target.value)}
            placeholder="whisper-1"
            value={transcriptionModel}
          />
        </div>
        <div className="button-row">
          <Button loading={save.isPending} type="submit">
            保存服务配置
          </Button>
          <Button
            disabled={!meta.data?.ai.configured}
            loading={test.isPending}
            onClick={() => test.mutate()}
            variant="secondary"
          >
            测试连接
          </Button>
          {test.isSuccess ? <span className="success-text">{test.data.message}</span> : null}
        </div>
        {save.isError || test.isError ? (
          <p className="inline-error">{save.error?.message ?? test.error?.message}</p>
        ) : null}
      </form>
      <AiActionLog />
    </section>
  )
}
