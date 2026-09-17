// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。

import { z } from "zod"
import type { ChatAction } from "../../../shared/aiChatActions.js"
import { itemIdSchema } from "../../../shared/items.js"
import {
  replaceCategoryRelations,
  replaceProjectRelations,
} from "../../repositories/itemMutations.js"
import { createItem, getItem, updateItem } from "../../repositories/items.js"
import { clearTodayItem } from "../../repositories/todayItems.js"
import { moveToTrash } from "../../repositories/trash.js"
import type { ChatActionContext } from "./context.js"
import { rememberAlias, resolveCategoryRef, resolveItemRef, resolveProjectRef } from "./refs.js"
import { recordAction, summarizeAction } from "./summary.js"
import { placeItemToday } from "./today.js"

export function runCreateItem(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "create_item" }>,
): string {
  const categoryIds = action.categoryIds.map((id) =>
    resolveCategoryRef(context.database, id, context.refs),
  )
  const projectIds = action.projectIds.map((id) =>
    resolveProjectRef(context.database, id, context.refs),
  )
  const existingId = z
    .object({ id: z.uuid() })
    .optional()
    .parse(
      context.database
        .prepare(
          `SELECT id FROM items
           WHERE deleted_at IS NULL AND status = 'active' AND title = ?
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(action.title),
    )?.id
  if (existingId !== undefined) {
    const before = getItem(context.database, existingId, context.localDate)
    rememberAlias(context.refs, action.as, existingId)
    if (projectIds.length > 0) {
      const mergedProjects = [...new Set([...before.projectIds, ...projectIds])]
      replaceProjectRelations(context.database, itemIdSchema.parse(existingId), mergedProjects)
    }
    if (categoryIds.length > 0) {
      replaceCategoryRelations(context.database, itemIdSchema.parse(existingId), categoryIds)
    }
    if (action.todayMode !== undefined) {
      placeItemToday(context.database, existingId, context.localDate, action.todayMode)
    }
    const todayNote =
      action.todayMode === undefined
        ? ""
        : action.todayMode === "secondary"
          ? "，并已加入今日次要"
          : action.todayMode === "focus"
            ? "，并已设为今日焦点"
            : "，并已加入今日"
    return `已有待办「${action.title}」，未重复创建${todayNote}。`
  }
  const item = createItem(
    context.database,
    {
      title: action.title,
      categoryIds,
      projectIds,
      ...(action.notes === undefined ? {} : { notes: action.notes }),
    },
    context.localDate,
    context.instant,
  )
  rememberAlias(context.refs, action.as, item.id)
  recordAction(context.database, "create_item", `创建待办「${item.title}」`, "item", item.id, {
    kind: "create_item",
    itemId: item.id,
    title: item.title,
  })
  if (action.todayMode !== undefined) {
    placeItemToday(context.database, item.id, context.localDate, action.todayMode)
  }
  const todayNote =
    action.todayMode === undefined
      ? ""
      : action.todayMode === "secondary"
        ? "，并已加入今日次要"
        : action.todayMode === "focus"
          ? "，并已设为今日焦点"
          : "，并已加入今日"
  return `已实际创建待办「${item.title}」${todayNote}，可在操作记录中撤销。`
}

export function runUpdateItem(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "update_item" }>,
): string {
  const itemId = resolveItemRef(context.database, action.itemId, context.refs)
  const before = getItem(context.database, itemId, context.localDate)
  const item = updateItem(
    context.database,
    itemId,
    {
      ...(action.title === undefined ? {} : { title: action.title }),
      ...(action.notes === undefined ? {} : { notes: action.notes }),
    },
    context.localDate,
    context.instant,
  )
  recordAction(context.database, "update_item", summarizeAction(action), "item", item.id, {
    kind: "update_item",
    itemId: item.id,
    previousTitle: before.title,
    previousNotes: before.notes,
  })
  return `已更新待办「${item.title}」，可在操作记录中撤销。`
}

export function runSetToday(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "set_today" }>,
): string {
  const itemId = resolveItemRef(context.database, action.itemId, context.refs)
  const item = getItem(context.database, itemId, context.localDate)
  const previous = {
    inToday: item.inToday,
    isFocus: item.isFocus,
    isSecondary: item.isSecondary,
  }
  if (action.mode === "clear") clearTodayItem(context.database, itemId, context.localDate)
  else placeItemToday(context.database, itemId, context.localDate, action.mode)
  if (action.mode === "clear") {
    recordAction(context.database, "set_today", summarizeAction(action), "item", itemId, {
      kind: "set_today",
      itemId,
      localDate: context.localDate,
      previous,
    })
  }
  return `已${summarizeAction(action)}，可在操作记录中撤销。`
}

export function runTrashItem(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "trash_item" }>,
): string {
  const itemId = resolveItemRef(context.database, action.itemId, context.refs)
  const item = getItem(context.database, itemId, context.localDate)
  moveToTrash(context.database, "item", itemId, item.title)
  const trashId = z
    .object({ id: z.uuid() })
    .parse(
      context.database
        .prepare("SELECT id FROM trash_entries WHERE entity_type = 'item' AND entity_id = ?")
        .get(itemId),
    ).id
  recordAction(context.database, "trash_item", `移入回收站「${item.title}」`, "item", itemId, {
    kind: "trash_item",
    itemId,
    trashId,
    title: item.title,
  })
  return `已将「${item.title}」移入回收站，可在操作记录中撤销。`
}

export function runSetItemCategories(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "set_item_categories" }>,
): string {
  const itemId = resolveItemRef(context.database, action.itemId, context.refs)
  const before = getItem(context.database, itemId, context.localDate)
  replaceCategoryRelations(
    context.database,
    itemIdSchema.parse(itemId),
    action.categoryIds.map((id) => resolveCategoryRef(context.database, id, context.refs)),
  )
  recordAction(context.database, "set_item_categories", summarizeAction(action), "item", itemId, {
    kind: "set_item_categories",
    itemId,
    previousCategoryIds: [...before.categoryIds],
  })
  return `已更新待办分类，可在操作记录中撤销。`
}

export function runArchiveItem(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "complete_item" | "archive_item" }>,
): string {
  const itemId = resolveItemRef(context.database, action.itemId, context.refs)
  const before = getItem(context.database, itemId, context.localDate)
  const status = action.action === "complete_item" ? "completed" : "archived"
  const item = updateItem(context.database, itemId, { status }, context.localDate, context.instant)
  recordAction(context.database, action.action, summarizeAction(action), "item", item.id, {
    kind: "item_status",
    itemId: item.id,
    previousStatus: before.status,
    previousCompletedAt: before.completedAt,
  })
  return `已${summarizeAction(action)}，可在操作记录中撤销。`
}
