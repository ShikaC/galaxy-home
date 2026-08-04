import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import { Button } from "../components/ui/Button.js"
import { TextField } from "../components/ui/Field.js"
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
  useEffect(() => {
    if (meta.data) {
      setChatBaseUrl(meta.data.ai.chatBaseUrl)
      setChatModel(meta.data.ai.chatModel)
      setTranscriptionBaseUrl(meta.data.ai.transcriptionBaseUrl)
      setTranscriptionModel(meta.data.ai.transcriptionModel)
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
      apiRequest("/api/settings", z.unknown(), {
        method: "PATCH",
        body: jsonBody({ aiPermission }),
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
        保守模式在修改前确认；开放模式可自动执行低风险且可撤销的操作。永久删除、导出和核心目标变更始终需要确认。
      </p>
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
    </section>
  )
}
