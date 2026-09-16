// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。
import type { DatabaseSync } from "node:sqlite"
import type { WorkspaceSettings } from "../../../shared/settings.js"

// 执行单个动作时共享的上下文。单独成文件，好让 handlers 与 execute 都能
// 引用它而不互相 import。
export type ChatActionContext = {
  readonly database: DatabaseSync
  readonly settings: WorkspaceSettings
  readonly localDate: string
  readonly refs: Map<string, string>
  readonly instant: Date
}
