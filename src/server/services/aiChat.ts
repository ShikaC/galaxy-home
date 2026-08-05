import type { DatabaseSync } from "node:sqlite"
import type { AiChatInput } from "../../shared/ai.js"
import { addMessage, createConversation, listMessages } from "../repositories/conversations.js"
import { getSettings } from "../repositories/settings.js"
import { type ChatMessage, chat } from "./ai.js"
import { buildAiContext } from "./aiContext.js"

export type PreparedAiChat = {
  readonly messages: readonly ChatMessage[]
  readonly references: ReturnType<typeof buildAiContext>["references"]
  readonly content: string
  readonly conversationId: string | null
}

export function prepareAiChat(database: DatabaseSync, input: AiChatInput): PreparedAiChat {
  const settings = getSettings(database)
  const prior =
    input.conversationId === null
      ? []
      : listMessages(database, input.conversationId).map((message) => ({
          role: message.role === "user" ? ("user" as const) : ("assistant" as const),
          content: message.content,
        }))
  const localContext = buildAiContext(
    database,
    settings,
    input.currentPath,
    input.currentLabel,
    input.content,
  )
  return {
    messages: [
      {
        role: "system",
        content: `你是${settings.aiNickname}，称呼用户为${settings.userName}。语气温和务实，不批评、不制造内疚。先识别精力和阻碍，再缩小到当前可做的最小动作，也允许休息和重新规划。不要声称掌握实时新闻、天气或价格。以下是本次允许参考的本地上下文：${localContext.prompt}`,
      },
      ...prior,
      { role: "user", content: input.content },
    ],
    references: localContext.references,
    content: input.content,
    conversationId: input.conversationId,
  }
}

export async function completeAiChat(
  secretPath: string,
  prepared: PreparedAiChat,
): Promise<string> {
  return chat(secretPath, prepared.messages)
}

export function persistAiChat(database: DatabaseSync, prepared: PreparedAiChat, answer: string) {
  const conversationId =
    prepared.conversationId ?? createConversation(database, prepared.content.slice(0, 24)).id
  addMessage(database, conversationId, "user", prepared.content)
  const message = addMessage(database, conversationId, "assistant", answer, prepared.references)
  return { conversationId, message }
}
