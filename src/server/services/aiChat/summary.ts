// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。
import type { DatabaseSync } from "node:sqlite"
import type { ChatAction } from "../../../shared/aiChatActions.js"
import { assertNever } from "../../../shared/assertNever.js"

export function summarizeAction(action: ChatAction): string {
  switch (action.action) {
    case "create_habit":
      return `创建习惯「${action.name}」`
    case "complete_habit":
      return `完成习惯「${action.habitId}」`
    case "create_category":
      return `创建分类「${action.name}」`
    case "create_item": {
      const today =
        action.todayMode === undefined
          ? ""
          : action.todayMode === "secondary"
            ? "并加入今日次要"
            : action.todayMode === "focus"
              ? "并设为今日焦点"
              : "并加入今日"
      return `创建待办「${action.title}」${today}`
    }
    case "update_item":
      return action.title === undefined ? "更新待办备注" : `将待办标题改为「${action.title}」`
    case "set_today":
      if (action.mode === "clear") return "将待办移出今日"
      if (action.mode === "focus") return "将待办设为今日焦点"
      if (action.mode === "secondary") return "将待办加入今日次要"
      return "将待办加入今日"
    case "trash_item":
      return "将待办移入回收站"
    case "set_item_categories":
      return `更新待办分类（${action.categoryIds.length} 个）`
    case "complete_item":
      return "将待办标为完成"
    case "archive_item":
      return "将待办归档"
    case "update_project_progress":
      return `将项目进度更新为 ${action.progress}%`
    case "create_project":
      return `创建项目「${action.name}」`
    case "propose_memory":
      return "提议保存长期记忆"
    default:
      return assertNever(action)
  }
}

export function summarizeActions(actions: readonly ChatAction[]): string {
  return actions.map((action, index) => `${index + 1}. ${summarizeAction(action)}`).join("；")
}

export function recordAction(
  database: DatabaseSync,
  actionType: string,
  reason: string,
  entityType: string,
  entityId: string,
  undoPayload: unknown,
): void {
  database
    .prepare(
      `INSERT INTO ai_action_log
       (id, action_type, reason, entity_type, entity_id, undo_payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      actionType,
      reason,
      entityType,
      entityId,
      JSON.stringify(undoPayload),
      new Date().toISOString(),
    )
}

export function claimsCompletedMutation(text: string): boolean {
  return /已(经)?(帮你)?(成功)?(创建|修改|更新|删除|归档|移入回收站|加入今日|添加到|完成|打卡|记录|标记)(了)?/.test(
    text,
  )
}
