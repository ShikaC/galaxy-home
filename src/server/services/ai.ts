import { z } from "zod"
import { AiInvalidEndpointError, assertSafeAiEndpoint } from "./aiEndpoint.js"
import { readSecretConfig } from "./secrets.js"

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1) }) })).min(1),
})
const streamChunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().optional() }) })),
})
const transcriptionSchema = z.object({ text: z.string().trim().min(1) })
const MAX_AI_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_AI_CONTENT_CHARS = 200_000
export type ChatMessage = {
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
  await assertSafeAiEndpoint(url)
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    })
  } catch (error) {
    if (error instanceof AiInvalidEndpointError) throw error
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      throw new AiServiceError("AI_UNAVAILABLE", "AI 服务请求超时，请稍后重试")
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
  const config = chatConfig(secretPath)
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
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_AI_RESPONSE_BYTES)
    throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回内容过大，未写入任何数据")
  try {
    const body = await response.text()
    if (body.length > MAX_AI_RESPONSE_BYTES)
      throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回内容过大，未写入任何数据")
    const completion = completionSchema.parse(JSON.parse(body))
    const choice = completion.choices[0]
    if (choice === undefined) throw new Error("Missing completion choice")
    return choice.message.content
  } catch {
    throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回了无法识别的内容，未写入任何数据")
  }
}

function chatConfig(secretPath: string) {
  const config = readSecretConfig(secretPath)
  if (config.chatBaseUrl === "" || config.chatModel === "" || config.apiKey === "") {
    throw new AiServiceError("AI_NOT_CONFIGURED", "AI 尚未配置，手动流程仍可正常使用")
  }
  return config
}

export function chat(secretPath: string, messages: readonly ChatMessage[]) {
  return requestCompletion(secretPath, messages, false)
}

export async function streamChat(
  secretPath: string,
  messages: readonly ChatMessage[],
  onDelta: (content: string) => void,
): Promise<string> {
  const config = chatConfig(secretPath)
  const response = await checkedFetch(`${config.chatBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.chatModel, messages, stream: true }),
  })
  if (response.body === null) throw new AiServiceError("AI_INVALID_RESPONSE", "AI 没有返回流式内容")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let content = ""
  let completed = false
  const processLine = (line: string): void => {
    const value = line.trim()
    if (!value.startsWith("data:")) return
    const payload = value.slice("data:".length).trim()
    if (payload === "[DONE]") {
      completed = true
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回了无法识别的流式内容")
    }
    const chunk = streamChunkSchema.safeParse(parsed)
    if (!chunk.success)
      throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回了无法识别的流式内容")
    const delta = chunk.data.choices[0]?.delta.content
    if (delta === undefined || delta === "") return
    if (content.length + delta.length > MAX_AI_CONTENT_CHARS)
      throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回内容过大，未写入任何数据")
    content += delta
    onDelta(delta)
  }

  try {
    while (!completed) {
      const result = await reader.read()
      buffer += decoder.decode(result.value, { stream: !result.done })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) processLine(line)
      if (result.done) break
    }
    buffer += decoder.decode()
    if (buffer !== "") processLine(buffer)
  } catch (error) {
    if (error instanceof AiServiceError) throw error
    throw new AiServiceError(
      "AI_UNAVAILABLE",
      error instanceof Error ? error.message : "AI 流式响应中断",
    )
  } finally {
    reader.releaseLock()
  }
  if (content.trim() === "") throw new AiServiceError("AI_INVALID_RESPONSE", "AI 返回了空内容")
  return content
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
  const baseUrl = config.transcriptionBaseUrl || config.chatBaseUrl
  const model = config.transcriptionModel || config.chatModel
  if (baseUrl === "" || model === "" || config.apiKey === "") {
    throw new AiServiceError("AI_NOT_CONFIGURED", "转写服务尚未配置")
  }
  const form = new FormData()
  form.set("model", model)
  form.set("file", new File([Uint8Array.from(file).buffer], filename, { type: mimeType }))
  const response = await checkedFetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })
  try {
    return transcriptionSchema.parse(await response.json()).text
  } catch {
    throw new AiServiceError("AI_INVALID_RESPONSE", "转写服务没有返回有效文本")
  }
}
