import type { DatabaseSync } from "node:sqlite"
import type { AiChatInput } from "../../shared/ai.js"
import { addMessage, createConversation, listMessages } from "../repositories/conversations.js"
import { getSettings } from "../repositories/settings.js"
import { type ChatMessage, chat } from "./ai.js"
import { applyAiChatActions, buildAiChatSystemPrompt, extractChatActions } from "./aiChatActions.js"
import { buildAiContext } from "./aiContext.js"

export type PreparedAiChat = {
  readonly messages: readonly ChatMessage[]
  readonly references: ReturnType<typeof buildAiContext>["references"]
  readonly content: string
  readonly conversationId: string | null
  readonly focusItemId?: string
}

const MAX_HISTORY_CHARS = 60_000
const ACTION_REPAIR_PROMPT =
  "上一条回答的 JSON 操作块无法解析。请保留用户原意，只重新输出合法的完整回答和动作块；不要追问，不要声称已执行，动作字段必须符合协议。"

function recentHistory(database: DatabaseSync, conversationId: string): readonly ChatMessage[] {
  const messages = listMessages(database, conversationId).map((message) => ({
    role: message.role === "user" ? ("user" as const) : ("assistant" as const),
    content: message.content,
  }))
  const selected: ChatMessage[] = []
  let total = 0
  for (const message of [...messages].reverse()) {
    if (selected.length > 0 && total + message.content.length > MAX_HISTORY_CHARS) break
    selected.unshift(message)
    total += message.content.length
  }
  return selected
}

export function prepareAiChat(database: DatabaseSync, input: AiChatInput): PreparedAiChat {
  const settings = getSettings(database)
  const prior = input.conversationId === null ? [] : recentHistory(database, input.conversationId)
  const localContext = buildAiContext(
    database,
    settings,
    input.currentPath,
    input.currentLabel,
    input.content,
    input.focusItemId,
  )
  return {
    messages: [
      {
        role: "system",
        content: buildAiChatSystemPrompt(settings, localContext.prompt, {
          ...(input.focusItemId === undefined ? {} : { focusItemId: input.focusItemId }),
        }),
      },
      ...prior,
      { role: "user", content: input.content },
    ],
    references: localContext.references,
    content: input.content,
    conversationId: input.conversationId,
    ...(input.focusItemId === undefined ? {} : { focusItemId: input.focusItemId }),
  }
}

export async function completeAiChat(
  secretPath: string,
  prepared: PreparedAiChat,
): Promise<string> {
  const answer = await chat(secretPath, prepared.messages)
  const extracted = extractChatActions(answer)
  if (!extracted.parseFailed || extracted.parseFailureKind === "incomplete_project") return answer
  return chat(secretPath, [
    ...prepared.messages,
    { role: "assistant", content: answer },
    { role: "user", content: ACTION_REPAIR_PROMPT },
  ])
}

export function persistAiChat(database: DatabaseSync, prepared: PreparedAiChat, answer: string) {
  const settings = getSettings(database)
  const finalized = applyAiChatActions(database, settings, answer)
  const conversationId =
    prepared.conversationId ?? createConversation(database, prepared.content.slice(0, 24)).id
  addMessage(database, conversationId, "user", prepared.content)
  const message = addMessage(
    database,
    conversationId,
    "assistant",
    finalized.text,
    prepared.references,
    {
      pendingAction: finalized.pendingAction,
      proposedMemory:
        finalized.proposedMemory === null
          ? null
          : { content: finalized.proposedMemory.content, kind: finalized.proposedMemory.kind },
    },
  )
  return { conversationId, message }
}
