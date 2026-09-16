import {
  type ChatAction,
  chatActionSchema,
  type PendingChatAction,
} from "../../../shared/aiChatActions.js"
import type { ActionCandidateRecord } from "./normalize.js"
import { normalizeActionCandidate } from "./normalize.js"

const ACTION_BLOCK_PATTERN = /```[ \t]*json\b\s*([\s\S]*?)\s*```/giu
export const MAX_ACTIONS_PER_TURN = 12

export type ApplyChatActionsResult = {
  readonly text: string
  readonly pendingAction: PendingChatAction | null
  readonly proposedMemory: Extract<ChatAction, { action: "propose_memory" }> | null
}

export function extractChatActions(answer: string): {
  readonly text: string
  readonly actions: readonly ChatAction[]
  readonly parseFailed: boolean
  readonly parseFailureKind: "incomplete_project" | "generic" | null
  readonly skippedInvalidCount: number
} {
  const match = [...answer.matchAll(ACTION_BLOCK_PATTERN)].pop()
  if (match === undefined) {
    return {
      text: answer.trimEnd(),
      actions: [],
      parseFailed: false,
      parseFailureKind: null,
      skippedInvalidCount: 0,
    }
  }
  const raw = match[1]
  const stripped =
    `${answer.slice(0, match.index)}${answer.slice(match.index + match[0].length)}`.trim()
  if (raw === undefined) {
    return {
      text: stripped,
      actions: [],
      parseFailed: true,
      parseFailureKind: "generic",
      skippedInvalidCount: 0,
    }
  }
  const parsed = tryParseActionJson(raw)
  if (parsed === undefined) {
    return {
      text: stripped,
      actions: [],
      parseFailed: true,
      parseFailureKind: "generic",
      skippedInvalidCount: 0,
    }
  }
  const candidates = Array.isArray(parsed) ? parsed : [parsed]
  if (candidates.length === 0 || candidates.length > MAX_ACTIONS_PER_TURN) {
    return {
      text: stripped,
      actions: [],
      parseFailed: true,
      parseFailureKind: "generic",
      skippedInvalidCount: 0,
    }
  }
  const actions: ChatAction[] = []
  let skippedInvalidCount = 0
  let sawIncompleteProject = false
  for (const candidate of candidates) {
    const action = chatActionSchema.safeParse(normalizeActionCandidate(candidate))
    if (action.success) {
      actions.push(action.data)
      continue
    }
    if (isIncompleteProjectCandidate(candidate)) sawIncompleteProject = true
    skippedInvalidCount += 1
  }
  if (actions.length === 0) {
    return {
      text: stripped,
      actions: [],
      parseFailed: true,
      parseFailureKind: sawIncompleteProject ? "incomplete_project" : "generic",
      skippedInvalidCount,
    }
  }
  return {
    text: stripped,
    actions,
    parseFailed: false,
    parseFailureKind: null,
    skippedInvalidCount,
  }
}

function tryParseActionJson(raw: string): unknown | undefined {
  const attempts = [raw, repairActionJson(raw)]
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate)
    } catch {
      /* try next */
    }
  }
  return undefined
}

function repairActionJson(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([\]}])/g, "$1")
}

function isIncompleteProjectCandidate(candidate: unknown): boolean {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return false
  const value = candidate as ActionCandidateRecord
  const action = typeof value.action === "string" ? value.action.trim().toLowerCase() : ""
  return (
    action === "create_project" ||
    action === "createproject" ||
    action === "create_plan" ||
    action === "createplan"
  )
}

export function looksLikeClarifyingQuestions(text: string): boolean {
  return /[？?]/.test(text) || /先(确认|问一下|了解)|还缺|需要知道|告诉我/.test(text)
}

export function coerceEntityRef(value: unknown): unknown {
  if (typeof value === "string") return value
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as ActionCandidateRecord
    const alias = record.id ?? record.name ?? record.title ?? record.uuid
    if (typeof alias === "string") return alias
  }
  return value
}

export function coerceEntityRefList(value: unknown): unknown {
  if (typeof value === "string") return [value]
  if (!Array.isArray(value)) return value
  return value.map((entry) => coerceEntityRef(entry))
}

export function extractChatAction(answer: string): {
  readonly text: string
  readonly action: ChatAction | null
} {
  const extracted = extractChatActions(answer)
  return { text: extracted.text, action: extracted.actions[0] ?? null }
}
