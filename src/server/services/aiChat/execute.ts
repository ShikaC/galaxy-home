// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。
import type { DatabaseSync } from "node:sqlite"
import type { ChatAction } from "../../../shared/aiChatActions.js"
import type { WorkspaceSettings } from "../../../shared/settings.js"
import { executeChatAction } from "./handlers.js"
import { summarizeAction } from "./summary.js"

const CONSERVATIVE_BLOCKED_ACTIONS = ["trash_item", "archive_item"] as const
const OPEN_CONFIRM_ACTIONS = ["trash_item"] as const

export function isConservativeBlockedAction(action: ChatAction): boolean {
  return (CONSERVATIVE_BLOCKED_ACTIONS as readonly string[]).includes(action.action)
}

export function isOpenConfirmAction(action: ChatAction): boolean {
  return (OPEN_CONFIRM_ACTIONS as readonly string[]).includes(action.action)
}

export function partitionBy(
  actions: readonly ChatAction[],
  predicate: (action: ChatAction) => boolean,
): {
  readonly matched: readonly ChatAction[]
  readonly rest: readonly ChatAction[]
} {
  const matched: ChatAction[] = []
  const rest: ChatAction[] = []
  for (const action of actions) {
    if (predicate(action)) matched.push(action)
    else rest.push(action)
  }
  return { matched, rest }
}

export function executeChatActions(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  actions: readonly ChatAction[],
  instant = new Date(),
): string {
  const executable = actions.filter((action) => action.action !== "propose_memory")
  if (executable.length === 0) throw new Error("没有可执行的操作")
  if (settings.aiPermission !== "open") {
    const blocked = executable.filter(isConservativeBlockedAction)
    if (blocked.length > 0) {
      throw new Error("保守模式不支持删除或归档，请切换到开放模式后再试")
    }
  }
  const refs = new Map<string, string>()
  const confirmations: string[] = []
  for (const [index, action] of executable.entries()) {
    try {
      confirmations.push(executeChatAction(database, settings, action, refs, instant))
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败"
      const head = confirmations.length === 0 ? "" : `${confirmations.join("\n")}\n\n`
      return `${head}（第 ${index + 1}/${executable.length} 步未能执行：${summarizeAction(action)} — ${message}。已成功 ${confirmations.length} 步，后续未继续；可在操作记录撤销已写入项后重试。）`
    }
  }
  return confirmations.join("\n")
}
