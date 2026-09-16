// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。

import type { DatabaseSync } from "node:sqlite"
import type { ChatAction } from "../../../shared/aiChatActions.js"
import { assertNever } from "../../../shared/assertNever.js"
import type { WorkspaceSettings } from "../../../shared/settings.js"
import { localClock } from "../time.js"
import type { ChatActionContext } from "./context.js"
import {
  runArchiveItem,
  runCreateItem,
  runSetItemCategories,
  runSetToday,
  runTrashItem,
  runUpdateItem,
} from "./handlersItem.js"
import {
  runCompleteHabit,
  runCreateCategory,
  runCreateHabit,
  runCreateProject,
  runUpdateProjectProgress,
} from "./handlersOrganization.js"

export function executeChatAction(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  action: ChatAction,
  refs: Map<string, string> = new Map(),
  instant = new Date(),
): string {
  if (action.action === "propose_memory") {
    throw new Error("propose_memory 不能直接执行")
  }
  const context: ChatActionContext = {
    database,
    settings,
    localDate: localClock(instant, settings.timezone).date,
    refs,
    instant,
  }
  switch (action.action) {
    case "create_item":
      return runCreateItem(context, action)
    case "update_item":
      return runUpdateItem(context, action)
    case "set_today":
      return runSetToday(context, action)
    case "trash_item":
      return runTrashItem(context, action)
    case "set_item_categories":
      return runSetItemCategories(context, action)
    case "complete_item":
    case "archive_item":
      return runArchiveItem(context, action)
    case "create_habit":
      return runCreateHabit(context, action)
    case "complete_habit":
      return runCompleteHabit(context, action)
    case "create_category":
      return runCreateCategory(context, action)
    case "update_project_progress":
      return runUpdateProjectProgress(context, action)
    case "create_project":
      return runCreateProject(context, action)
    default:
      return assertNever(action)
  }
}
