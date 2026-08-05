import { z } from "zod"
import {
  type AiChatInput,
  aiChatInputSchema,
  aiChatResponseSchema,
  aiStreamEventSchema,
} from "../../shared/ai.js"
import { ApiError } from "./api.js"

const errorSchema = z.object({ code: z.string(), message: z.string() })

async function throwHttpError(response: Response): Promise<never> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null))
  throw new ApiError(
    parsed.success ? parsed.data.code : "NETWORK_ERROR",
    parsed.success ? parsed.data.message : "请求失败，请稍后再试",
  )
}

export async function streamAiChat(
  input: AiChatInput,
  onDelta: (content: string) => void,
): Promise<z.output<typeof aiChatResponseSchema>> {
  const response = await fetch("/api/ai/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(aiChatInputSchema.parse(input)),
  })
  if (!response.ok) await throwHttpError(response)
  if (response.body === null) throw new ApiError("NETWORK_ERROR", "AI 没有返回流式内容")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let completed: z.output<typeof aiChatResponseSchema> | null = null
  const processBlock = (block: string): void => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n")
    if (data === "") return
    let raw: unknown
    try {
      raw = JSON.parse(data)
    } catch {
      throw new ApiError("AI_INVALID_RESPONSE", "AI 返回了无法识别的流式内容")
    }
    const parsed = aiStreamEventSchema.safeParse(raw)
    if (!parsed.success) throw new ApiError("AI_INVALID_RESPONSE", "AI 返回了无法识别的流式内容")
    if (parsed.data.type === "delta") onDelta(parsed.data.content)
    if (parsed.data.type === "error") throw new ApiError(parsed.data.code, parsed.data.message)
    if (parsed.data.type === "done") {
      completed = aiChatResponseSchema.parse({
        conversationId: parsed.data.conversationId,
        message: parsed.data.message,
      })
    }
  }

  try {
    while (true) {
      const result = await reader.read()
      buffer += decoder.decode(result.value, { stream: !result.done }).replace(/\r\n/g, "\n")
      let boundary = buffer.indexOf("\n\n")
      while (boundary >= 0) {
        processBlock(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")
      }
      if (result.done) break
    }
    buffer += decoder.decode().replace(/\r\n/g, "\n")
    if (buffer !== "") processBlock(buffer)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError("NETWORK_ERROR", "AI 流式响应中断")
  } finally {
    reader.releaseLock()
  }
  if (completed === null) throw new ApiError("AI_INVALID_RESPONSE", "AI 未完成流式响应")
  return completed
}
