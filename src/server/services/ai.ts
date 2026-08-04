import { z } from "zod"
import { readSecretConfig } from "./secrets.js"

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
})
const transcriptionSchema = z.object({ text: z.string().trim().min(1) })
type ChatMessage = {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

export class AiServiceError extends Error {
  readonly name = "AiServiceError"
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

async function checkedFetch(url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) })
  } catch (error) {
    throw new AiServiceError(
      "AI_UNAVAILABLE",
      error instanceof Error ? error.message : "AI 服务暂时不可用",
    )
  }
  if (response.status === 401 || response.status === 403)
    throw new AiServiceError("AI_AUTH", "AI 服务鉴权失败")
  if (response.status === 429)
    throw new AiServiceError("AI_RATE_LIMIT", "AI 服务请求过于频繁，请稍后再试")
  if (!response.ok) throw new AiServiceError("AI_UNAVAILABLE", `AI 服务返回 ${response.status}`)
  return response
}

async function requestCompletion(
  secretPath: string,
  messages: readonly ChatMessage[],
  structured: boolean,
): Promise<string> {
  const config = readSecretConfig(secretPath)
  if (config.chatBaseUrl === "" || config.chatModel === "" || config.apiKey === "") {
    throw new AiServiceError("AI_NOT_CONFIGURED", "AI 尚未配置，手动流程仍可正常使用")
  }
  const response = await checkedFetch(`${config.chatBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      stream: false,
      ...(structured ? { response_format: { type: "json_object" } } : {}),
    }),
  })
  try {
    return completionSchema.parse(await response.json()).choices[0]?.message.content ?? ""
  } catch {
    throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回了无法识别的内容，未写入任何数据")
  }
}

export function chat(secretPath: string, messages: readonly ChatMessage[]) {
  return requestCompletion(secretPath, messages, false)
}

export async function chatStructured<Schema extends z.ZodType>(
  secretPath: string,
  messages: readonly ChatMessage[],
  schema: Schema,
): Promise<z.output<Schema>> {
  const content = await requestCompletion(secretPath, messages, true)
  try {
    return schema.parse(JSON.parse(content))
  } catch {
    throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回了无法识别的结构，未写入任何数据")
  }
}

export async function transcribe(
  secretPath: string,
  file: Uint8Array,
  filename: string,
  mimeType: string,
) {
  const config = readSecretConfig(secretPath)
  if (
    config.transcriptionBaseUrl === "" ||
    config.transcriptionModel === "" ||
    config.apiKey === ""
  ) {
    throw new AiServiceError("AI_NOT_CONFIGURED", "转写服务尚未配置")
  }
  const form = new FormData()
  form.set("model", config.transcriptionModel)
  form.set("file", new File([Uint8Array.from(file).buffer], filename, { type: mimeType }))
  const response = await checkedFetch(
    `${config.transcriptionBaseUrl.replace(/\/$/, "")}/audio/transcriptions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    },
  )
  try {
    return transcriptionSchema.parse(await response.json()).text
  } catch {
    throw new AiServiceError("AI_INVALID_RESPONSE", "转写服务没有返回有效文本")
  }
}
