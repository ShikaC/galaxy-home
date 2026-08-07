import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  type ChatAction,
  chatActionSchema,
  type PendingChatAction,
} from "../../shared/aiChatActions.js"
import { assertNever } from "../../shared/assertNever.js"
import { createHabitInputSchema } from "../../shared/habits.js"
import { categoryIdSchema, itemIdSchema, projectIdSchema } from "../../shared/items.js"
import { createProjectInputSchema } from "../../shared/projects.js"
import { DEFAULT_AI_PERSONALITY_PROMPT, type WorkspaceSettings } from "../../shared/settings.js"
import { createHabit } from "../repositories/habits.js"
import {
  createItem,
  getItem,
  replaceItemCategories,
  updateItem,
} from "../repositories/items.js"
import { createProject, updateProjectProgress } from "../repositories/projects.js"
import { clearTodayItem, setTodayItem } from "../repositories/todayItems.js"
import { moveToTrash } from "../repositories/trash.js"
import { localClock } from "./time.js"

const ACTION_BLOCK_PATTERN = /```json\s*([\s\S]*?)\s*```\s*$/u
const MAX_ACTIONS_PER_TURN = 12

export type ApplyChatActionsResult = {
  readonly text: string
  readonly pendingAction: PendingChatAction | null
  readonly proposedMemory: Extract<ChatAction, { action: "propose_memory" }> | null
}

function resolveEntityRef(value: string, refs: ReadonlyMap<string, string>): string {
  if (!value.startsWith("$")) return value
  const resolved = refs.get(value.slice(1))
  if (resolved === undefined) throw new Error(`未知引用 ${value}`)
  return resolved
}

function resolveProjectRef(
  database: DatabaseSync,
  value: string,
  refs: ReadonlyMap<string, string>,
): z.infer<typeof projectIdSchema> {
  const resolved = resolveEntityRef(value, refs)
  if (z.string().uuid().safeParse(resolved).success) return projectIdSchema.parse(resolved)
  const row = z
    .object({ id: z.string().uuid() })
    .optional()
    .parse(
      database
        .prepare(
          "SELECT id FROM projects WHERE deleted_at IS NULL AND name = ? ORDER BY updated_at DESC LIMIT 1",
        )
        .get(resolved),
    )
  if (row === undefined) throw new Error(`找不到项目「${value}」`)
  return projectIdSchema.parse(row.id)
}

function resolveItemRef(
  database: DatabaseSync,
  value: string,
  refs: ReadonlyMap<string, string>,
): z.infer<typeof itemIdSchema> {
  const resolved = resolveEntityRef(value, refs)
  if (z.string().uuid().safeParse(resolved).success) return itemIdSchema.parse(resolved)
  const row = z
    .object({ id: z.string().uuid() })
    .optional()
    .parse(
      database
        .prepare(
          `SELECT id FROM items WHERE deleted_at IS NULL AND title = ?
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(resolved),
    )
  if (row === undefined) throw new Error(`找不到待办「${value}」`)
  return itemIdSchema.parse(row.id)
}

function resolveCategoryRef(
  database: DatabaseSync,
  value: string,
  refs: ReadonlyMap<string, string>,
): z.infer<typeof categoryIdSchema> {
  const resolved = resolveEntityRef(value, refs)
  if (z.string().uuid().safeParse(resolved).success) return categoryIdSchema.parse(resolved)
  const row = z
    .object({ id: z.string().uuid() })
    .optional()
    .parse(
      database
        .prepare(
          "SELECT id FROM categories WHERE deleted_at IS NULL AND name = ? ORDER BY updated_at DESC LIMIT 1",
        )
        .get(resolved),
    )
  if (row === undefined) throw new Error(`找不到分类「${value}」`)
  return categoryIdSchema.parse(row.id)
}

function rememberAlias(
  refs: Map<string, string>,
  alias: string | undefined,
  id: string,
): void {
  if (alias === undefined) return
  if (refs.has(alias)) throw new Error(`别名「${alias}」重复`)
  refs.set(alias, id)
}

export function extractChatActions(answer: string): {
  readonly text: string
  readonly actions: readonly ChatAction[]
  readonly parseFailed: boolean
  readonly parseFailureKind: "incomplete_project" | "generic" | null
} {
  const match = ACTION_BLOCK_PATTERN.exec(answer)
  if (match === null) {
    return { text: answer.trimEnd(), actions: [], parseFailed: false, parseFailureKind: null }
  }
  const raw = match[1]
  const stripped = answer.slice(0, match.index).trimEnd()
  if (raw === undefined) {
    return { text: stripped, actions: [], parseFailed: true, parseFailureKind: "generic" }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { text: stripped, actions: [], parseFailed: true, parseFailureKind: "generic" }
  }
  const candidates = Array.isArray(parsed) ? parsed : [parsed]
  if (candidates.length === 0 || candidates.length > MAX_ACTIONS_PER_TURN) {
    return { text: stripped, actions: [], parseFailed: true, parseFailureKind: "generic" }
  }
  const actions: ChatAction[] = []
  for (const candidate of candidates) {
    const action = chatActionSchema.safeParse(normalizeActionCandidate(candidate))
    if (!action.success) {
      return {
        text: stripped,
        actions: [],
        parseFailed: true,
        parseFailureKind: isIncompleteProjectCandidate(candidate) ? "incomplete_project" : "generic",
      }
    }
    actions.push(action.data)
  }
  return { text: stripped, actions, parseFailed: false, parseFailureKind: null }
}

function isIncompleteProjectCandidate(candidate: unknown): boolean {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return false
  const value = candidate as Record<string, unknown>
  const action = typeof value["action"] === "string" ? value["action"].trim().toLowerCase() : ""
  return action === "create_project" || action === "createproject" || action === "create_plan"
}

function looksLikeClarifyingQuestions(text: string): boolean {
  return /[？?]/.test(text) || /先(确认|问一下|了解)|还缺|需要知道|告诉我/.test(text)
}

function coerceEntityRef(value: unknown): unknown {
  if (typeof value === "string") return value
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const alias = record["id"] ?? record["name"] ?? record["title"] ?? record["uuid"]
    if (typeof alias === "string") return alias
  }
  return value
}

function coerceEntityRefList(value: unknown): unknown {
  if (typeof value === "string") return [value]
  if (!Array.isArray(value)) return value
  return value.map((entry) => coerceEntityRef(entry))
}

function normalizeActionCandidate(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw
  const value = { ...(raw as Record<string, unknown>) }
  if (typeof value["action"] === "string") {
    const action = value["action"].trim().toLowerCase()
    if (
      [
        "set_categories",
        "set_category",
        "set_item_category",
        "update_item_categories",
        "assign_categories",
        "update_categories",
      ].includes(action)
    ) {
      value["action"] = "set_item_categories"
    }
  }
  if (value["action"] === "create_habit") {
    if (value["type"] === undefined) {
      const typeAlias = value["habitType"] ?? value["kind"] ?? value["checkType"]
      if (typeof typeAlias === "string") value["type"] = typeAlias
    }
    if (typeof value["type"] === "string") {
      const type = value["type"].trim().toLowerCase()
      if (type === "checkbox" || type === "tick" || type === "打卡" || type === "勾选") {
        value["type"] = "check"
      } else if (type === "counter" || type === "计数") {
        value["type"] = "count"
      }
    }
    if (value["type"] === undefined) value["type"] = "check"

    if (value["frequencyType"] === undefined) {
      const frequencyAlias = value["frequency"] ?? value["freq"] ?? value["schedule"]
      if (typeof frequencyAlias === "string") value["frequencyType"] = frequencyAlias
    }
    if (typeof value["frequencyType"] === "string") {
      const frequency = value["frequencyType"].trim().toLowerCase()
      if (["daily", "day", "everyday", "每天", "每日"].includes(frequency)) {
        value["frequencyType"] = "daily"
      } else if (["weekly", "week", "每周"].includes(frequency)) {
        value["frequencyType"] = "weekly"
      }
    }
    if (value["frequencyType"] === undefined) value["frequencyType"] = "daily"

    if (value["targetCount"] === undefined) {
      const targetAlias = value["target"] ?? value["count"] ?? value["times"] ?? value["goal"]
      if (typeof targetAlias === "number" || typeof targetAlias === "string") {
        value["targetCount"] = targetAlias
      }
    }
    if (typeof value["targetCount"] === "string" && value["targetCount"].trim() !== "") {
      const parsed = Number(value["targetCount"])
      if (Number.isFinite(parsed)) value["targetCount"] = parsed
    }
    if (value["targetCount"] === undefined) value["targetCount"] = 1

    if (value["weeklyTarget"] === undefined) {
      const weeklyAlias = value["weekly_target"] ?? value["weekTarget"]
      if (weeklyAlias === null || typeof weeklyAlias === "number" || typeof weeklyAlias === "string") {
        value["weeklyTarget"] = weeklyAlias
      }
    }
    if (typeof value["weeklyTarget"] === "string" && value["weeklyTarget"].trim() !== "") {
      const parsed = Number(value["weeklyTarget"])
      if (Number.isFinite(parsed)) value["weeklyTarget"] = parsed
    }
    if (value["weeklyTarget"] === undefined) value["weeklyTarget"] = null
    if (value["restDays"] === undefined) value["restDays"] = []
  }
  if (value["action"] === "create_item") {
    if (value["projectIds"] === undefined && typeof value["projectId"] === "string") {
      value["projectIds"] = [value["projectId"]]
    }
    if (value["categoryIds"] === undefined && typeof value["categoryId"] === "string") {
      value["categoryIds"] = [value["categoryId"]]
    }
    value["projectIds"] = coerceEntityRefList(value["projectIds"])
    value["categoryIds"] = coerceEntityRefList(value["categoryIds"])
  }
  if (
    value["action"] === "update_item" ||
    value["action"] === "set_today" ||
    value["action"] === "trash_item" ||
    value["action"] === "complete_item" ||
    value["action"] === "archive_item" ||
    value["action"] === "set_item_categories"
  ) {
    if (value["itemId"] === undefined) {
      const itemAlias = value["id"] ?? value["item"] ?? value["title"]
      if (typeof itemAlias === "string" || (itemAlias !== null && typeof itemAlias === "object")) {
        value["itemId"] = itemAlias
      }
    }
    value["itemId"] = coerceEntityRef(value["itemId"])
  }
  if (value["action"] === "set_item_categories") {
    if (value["categoryIds"] === undefined) {
      const categoryAlias = value["categories"] ?? value["categoryId"] ?? value["category"]
      if (categoryAlias !== undefined) value["categoryIds"] = categoryAlias
    }
    value["categoryIds"] = coerceEntityRefList(value["categoryIds"])
  }
  if (value["action"] === "update_project_progress") {
    if (value["projectId"] === undefined) {
      const projectAlias = value["id"] ?? value["project"] ?? value["name"]
      if (typeof projectAlias === "string" || (projectAlias !== null && typeof projectAlias === "object")) {
        value["projectId"] = projectAlias
      }
    }
    value["projectId"] = coerceEntityRef(value["projectId"])
    if (value["progress"] === undefined) {
      const progressAlias = value["percent"] ?? value["value"]
      if (typeof progressAlias === "number" || typeof progressAlias === "string") {
        value["progress"] = progressAlias
      }
    }
    if (typeof value["progress"] === "string" && value["progress"].trim() !== "") {
      const parsed = Number(value["progress"].replace(/%/g, ""))
      if (Number.isFinite(parsed)) value["progress"] = parsed
    }
  }
  return value
}

/** @deprecated use extractChatActions */
export function extractChatAction(answer: string): {
  readonly text: string
  readonly action: ChatAction | null
} {
  const extracted = extractChatActions(answer)
  return { text: extracted.text, action: extracted.actions[0] ?? null }
}

function summarizeAction(action: ChatAction): string {
  switch (action.action) {
    case "create_habit":
      return `创建习惯「${action.name}」`
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

function summarizeActions(actions: readonly ChatAction[]): string {
  return actions.map((action, index) => `${index + 1}. ${summarizeAction(action)}`).join("；")
}

function countPrimaryTodayItems(database: DatabaseSync, localDate: string): number {
  return z
    .object({ count: z.number().int().nonnegative() })
    .parse(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM today_items
           JOIN items ON items.id = today_items.item_id
           WHERE today_items.local_date = ? AND today_items.is_secondary = 0
             AND items.status = 'active' AND items.deleted_at IS NULL`,
        )
        .get(localDate),
    ).count
}

function assertBatchTodayCapacity(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  actions: readonly ChatAction[],
): void {
  const localDate = localClock(new Date(), settings.timezone).date
  const existing = countPrimaryTodayItems(database, localDate)
  const needed = actions.reduce((count, action) => {
    if (action.action === "create_item") {
      return action.todayMode === "today" || action.todayMode === "focus" ? count + 1 : count
    }
    if (action.action === "set_today") {
      return action.mode === "today" || action.mode === "focus" ? count + 1 : count
    }
    return count
  }, 0)
  if (existing + needed <= 3) return
  throw new Error(
    `今日主要待办最多 3 个（当前 ${existing}，本批还要加入 ${needed}）。请将超出项改为 todayMode/mode: secondary，或先移出部分今日待办。`,
  )
}

function recordAction(
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

function claimsCompletedMutation(text: string): boolean {
  return /已(经)?(帮你)?(成功)?(创建|修改|删除|归档|移入回收站|加入今日|添加到)(了)?/.test(text)
}

function placeItemToday(
  database: DatabaseSync,
  itemId: string,
  localDate: string,
  mode: "today" | "focus" | "secondary",
): void {
  const previousItem = getItem(database, itemId, localDate)
  const previous = {
    inToday: previousItem.inToday,
    isFocus: previousItem.isFocus,
    isSecondary: previousItem.isSecondary,
  }
  if (mode === "secondary") {
    setTodayItem(database, {
      itemId: itemIdSchema.parse(itemId),
      localDate,
      isFocus: false,
      isSecondary: true,
    })
  } else {
    setTodayItem(database, {
      itemId: itemIdSchema.parse(itemId),
      localDate,
      isFocus: mode === "focus",
      isSecondary: false,
    })
  }
  recordAction(
    database,
    "set_today",
    mode === "secondary"
      ? "将待办加入今日次要"
      : mode === "focus"
        ? "将待办设为今日焦点"
        : "将待办加入今日",
    "item",
    itemId,
    { kind: "set_today", itemId, localDate, previous },
  )
}

export function executeChatAction(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  action: ChatAction,
  refs: Map<string, string> = new Map(),
): string {
  if (action.action === "propose_memory") {
    throw new Error("propose_memory 不能直接执行")
  }
  const localDate = localClock(new Date(), settings.timezone).date
  switch (action.action) {
    case "create_habit": {
      const habit = createHabit(
        database,
        createHabitInputSchema.parse({
          name: action.name,
          type: action.type,
          targetCount: action.targetCount,
          frequencyType: action.frequencyType,
          weeklyTarget: action.weeklyTarget,
          restDays: action.restDays,
        }),
        localDate,
      )
      rememberAlias(refs, action.as, habit.id)
      recordAction(database, "create_habit", `创建习惯「${habit.name}」`, "habit", habit.id, {
        kind: "create_habit",
        habitId: habit.id,
        name: habit.name,
      })
      return `已实际创建习惯「${habit.name}」，可在操作记录中撤销。`
    }
    case "create_item": {
      const item = createItem(
        database,
        {
          title: action.title,
          categoryIds: action.categoryIds.map((id) => resolveCategoryRef(database, id, refs)),
          projectIds: action.projectIds.map((id) => resolveProjectRef(database, id, refs)),
          ...(action.notes === undefined ? {} : { notes: action.notes }),
        },
        localDate,
      )
      rememberAlias(refs, action.as, item.id)
      recordAction(database, "create_item", `创建待办「${item.title}」`, "item", item.id, {
        kind: "create_item",
        itemId: item.id,
        title: item.title,
      })
      if (action.todayMode !== undefined) {
        placeItemToday(database, item.id, localDate, action.todayMode)
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
    case "update_item": {
      const itemId = resolveItemRef(database, action.itemId, refs)
      const before = getItem(database, itemId, localDate)
      const item = updateItem(
        database,
        itemId,
        {
          ...(action.title === undefined ? {} : { title: action.title }),
          ...(action.notes === undefined ? {} : { notes: action.notes }),
        },
        localDate,
      )
      recordAction(database, "update_item", summarizeAction(action), "item", item.id, {
        kind: "update_item",
        itemId: item.id,
        previousTitle: before.title,
        previousNotes: before.notes,
      })
      return `已更新待办「${item.title}」，可在操作记录中撤销。`
    }
    case "set_today": {
      const itemId = resolveItemRef(database, action.itemId, refs)
      const item = getItem(database, itemId, localDate)
      const previous = {
        inToday: item.inToday,
        isFocus: item.isFocus,
        isSecondary: item.isSecondary,
      }
      if (action.mode === "clear") clearTodayItem(database, itemId, localDate)
      else placeItemToday(database, itemId, localDate, action.mode)
      if (action.mode === "clear") {
        recordAction(database, "set_today", summarizeAction(action), "item", itemId, {
          kind: "set_today",
          itemId,
          localDate,
          previous,
        })
      }
      return `已${summarizeAction(action)}，可在操作记录中撤销。`
    }
    case "trash_item": {
      const itemId = resolveItemRef(database, action.itemId, refs)
      const item = getItem(database, itemId, localDate)
      moveToTrash(database, "item", itemId, item.title)
      const trashId = z
        .object({ id: z.string().uuid() })
        .parse(
          database
            .prepare(
              "SELECT id FROM trash_entries WHERE entity_type = 'item' AND entity_id = ?",
            )
            .get(itemId),
        ).id
      recordAction(database, "trash_item", `移入回收站「${item.title}」`, "item", itemId, {
        kind: "trash_item",
        itemId,
        trashId,
        title: item.title,
      })
      return `已将「${item.title}」移入回收站，可在操作记录中撤销。`
    }
    case "set_item_categories": {
      const itemId = resolveItemRef(database, action.itemId, refs)
      const before = getItem(database, itemId, localDate)
      replaceItemCategories(
        database,
        itemIdSchema.parse(itemId),
        action.categoryIds.map((id) => resolveCategoryRef(database, id, refs)),
      )
      recordAction(database, "set_item_categories", summarizeAction(action), "item", itemId, {
        kind: "set_item_categories",
        itemId,
        previousCategoryIds: [...before.categoryIds],
      })
      return `已更新待办分类，可在操作记录中撤销。`
    }
    case "complete_item":
    case "archive_item": {
      const itemId = resolveItemRef(database, action.itemId, refs)
      const before = getItem(database, itemId, localDate)
      const status = action.action === "complete_item" ? "completed" : "archived"
      const item = updateItem(database, itemId, { status }, localDate)
      recordAction(database, action.action, summarizeAction(action), "item", item.id, {
        kind: "item_status",
        itemId: item.id,
        previousStatus: before.status,
        previousCompletedAt: before.completedAt,
      })
      return `已${summarizeAction(action)}，可在操作记录中撤销。`
    }
    case "update_project_progress": {
      const projectId = resolveProjectRef(database, action.projectId, refs)
      const before = z
        .object({ progress: z.number().int() })
        .parse(
          database
            .prepare("SELECT progress FROM projects WHERE id = ? AND deleted_at IS NULL")
            .get(projectId),
        )
      updateProjectProgress(database, projectId, action.progress)
      recordAction(
        database,
        "update_project_progress",
        summarizeAction(action),
        "project",
        projectId,
        {
          kind: "update_project_progress",
          projectId,
          previousProgress: before.progress,
        },
      )
      return `已将项目进度更新为 ${action.progress}%，可在操作记录中撤销。`
    }
    case "create_project": {
      const project = createProject(
        database,
        createProjectInputSchema.parse({
          name: action.name,
          desiredOutcome: action.desiredOutcome,
          reason: action.reason ?? null,
          notes: action.notes ?? null,
          deadlineDate: action.deadlineDate ?? null,
          stageTitle: action.stageTitle ?? "迈出第一步",
          currentTask: action.currentTask ?? null,
          nextTask: action.nextTask ?? null,
        }),
      )
      rememberAlias(refs, action.as, project.id)
      recordAction(database, "create_project", `创建项目「${project.name}」`, "project", project.id, {
        kind: "create_project",
        projectId: project.id,
        name: project.name,
      })
      return `已实际创建项目「${project.name}」，可在操作记录中撤销。`
    }
    default:
      return assertNever(action)
  }
}

const CONSERVATIVE_BLOCKED_ACTIONS = ["trash_item", "archive_item"] as const
const OPEN_CONFIRM_ACTIONS = ["trash_item"] as const

function isConservativeBlockedAction(action: ChatAction): boolean {
  return (CONSERVATIVE_BLOCKED_ACTIONS as readonly string[]).includes(action.action)
}

function isOpenConfirmAction(action: ChatAction): boolean {
  return (OPEN_CONFIRM_ACTIONS as readonly string[]).includes(action.action)
}

function partitionBy(
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
): string {
  const executable = actions.filter((action) => action.action !== "propose_memory")
  if (executable.length === 0) throw new Error("没有可执行的操作")
  if (settings.aiPermission !== "open") {
    const blocked = executable.filter(isConservativeBlockedAction)
    if (blocked.length > 0) {
      throw new Error("保守模式不支持删除或归档，请切换到开放模式后再试")
    }
  }
  assertBatchTodayCapacity(database, settings, executable)
  const refs = new Map<string, string>()
  const confirmations: string[] = []
  for (const [index, action] of executable.entries()) {
    try {
      confirmations.push(executeChatAction(database, settings, action, refs))
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败"
      const head = confirmations.length === 0 ? "" : `${confirmations.join("\n")}\n\n`
      return `${head}（第 ${index + 1}/${executable.length} 步未能执行：${summarizeAction(action)} — ${message}。已成功 ${confirmations.length} 步，后续未继续；可在操作记录撤销已写入项后重试。）`
    }
  }
  return confirmations.join("\n")
}

export function applyAiChatActions(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  answer: string,
): ApplyChatActionsResult {
  const extracted = extractChatActions(answer)
  if (extracted.actions.length === 0) {
    if (extracted.parseFailed) {
      const base = extracted.text
      if (extracted.parseFailureKind === "incomplete_project") {
        if (base !== "" && looksLikeClarifyingQuestions(base)) {
          return { text: base, pendingAction: null, proposedMemory: null }
        }
        return {
          text: `${base === "" ? "" : `${base}\n\n`}这个计划还缺一点关键信息，我先不创建。你可以直接告诉我：想达成什么结果？大概希望多久看到进展？我再帮你建。`,
          pendingAction: null,
          proposedMemory: null,
        }
      }
      return {
        text: `${base === "" ? "" : `${base}\n\n`}（未能执行：操作块格式不正确或字段不完整，工作空间未改动。请按协议字段重试，例如 create_habit 需要 frequencyType、targetCount、weeklyTarget、restDays。）`,
        pendingAction: null,
        proposedMemory: null,
      }
    }
    const text = extracted.text === "" ? answer.trim() : extracted.text
    if (!claimsCompletedMutation(text))
      return { text, pendingAction: null, proposedMemory: null }
    return {
      text: `${text}\n\n（说明：本次没有改动你的工作空间数据。若要真正执行，请再发一次并附上操作块；保守模式下还需确认。）`,
      pendingAction: null,
      proposedMemory: null,
    }
  }
  const proposedMemory =
    [...extracted.actions]
      .reverse()
      .find((action): action is Extract<ChatAction, { action: "propose_memory" }> =>
        action.action === "propose_memory",
      ) ?? null
  const executable = extracted.actions.filter((action) => action.action !== "propose_memory")
  if (executable.length === 0) {
    return {
      text:
        extracted.text === ""
          ? "我建议把这条记为长期记忆，确认后才会保存。"
          : extracted.text,
      pendingAction: null,
      proposedMemory,
    }
  }
  if (settings.aiPermission !== "open") {
    const { matched: blocked, rest: allowed } = partitionBy(
      executable,
      isConservativeBlockedAction,
    )
    const blockedNote =
      blocked.length === 0
        ? ""
        : `（保守模式不支持删除或归档：已跳过 ${summarizeActions(blocked)}。如需删除请切换到开放模式并确认后执行。）`
    if (allowed.length === 0) {
      const base = extracted.text === "" ? "" : `${extracted.text}\n\n`
      return {
        text: `${base}${blockedNote || "（保守模式不支持删除或归档，请切换到开放模式后再试。）"}`,
        pendingAction: null,
        proposedMemory,
      }
    }
    const summary = summarizeActions(allowed)
    const base =
      extracted.text === ""
        ? `我准备执行 ${allowed.length} 项改动，需要你确认。`
        : extracted.text
    return {
      text: `${base}\n\n（待确认：${summary}）${blockedNote === "" ? "" : `\n\n${blockedNote}`}`,
      pendingAction: { status: "pending", actions: [...allowed], summary },
      proposedMemory,
    }
  }
  const { matched: needsConfirm, rest: immediate } = partitionBy(executable, isOpenConfirmAction)
  let executedText = ""
  if (immediate.length > 0) {
    try {
      executedText = executeChatActions(database, settings, immediate)
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败"
      return {
        text: `${extracted.text === "" ? "" : `${extracted.text}\n\n`}（未能执行：${message}。本次未写入；可调整后重试。）`,
        pendingAction: null,
        proposedMemory: null,
      }
    }
  }
  if (needsConfirm.length === 0) {
    return {
      text:
        extracted.text === ""
          ? executedText
          : executedText === ""
            ? extracted.text
            : `${extracted.text}\n\n${executedText}`,
      pendingAction: null,
      proposedMemory,
    }
  }
  const summary = summarizeActions(needsConfirm)
  const parts = [
    extracted.text,
    executedText,
    `（待确认：${summary}）`,
  ].filter((part) => part !== "")
  return {
    text: parts.join("\n\n"),
    pendingAction: { status: "pending", actions: [...needsConfirm], summary },
    proposedMemory,
  }
}

export function buildAiChatSystemPrompt(
  settings: WorkspaceSettings,
  contextPrompt: string,
  options?: { readonly focusItemId?: string },
): string {
  const personality =
    settings.aiPersonalityPrompt.trim() === ""
      ? DEFAULT_AI_PERSONALITY_PROMPT
      : settings.aiPersonalityPrompt.trim()
  const identity = `你是${settings.aiNickname}，称呼用户为${settings.userName}。${personality}不要声称掌握实时新闻、天气或价格。`
  const honesty =
    "除非服务器已执行操作或用户确认待执行操作，否则绝不要声称已创建、已修改、已删除或已保存任何工作空间内容。"
  const focusHint =
    options?.focusItemId === undefined
      ? ""
      : `用户正聚焦待办 ${options.focusItemId}。若要求「缩小」，优先输出 update_item，把标题改成今天可完成的一小步；可用 notes 保留原意图摘要。`
  const protocol = `可在回复末尾附加一个 JSON 代码块：单个操作对象，或最多 ${MAX_ACTIONS_PER_TURN} 个操作的数组（按顺序执行）。用户一次要求多项改动时，必须在同一数组里写全，不要只做第一步。
同一批内可用 "as":"别名" 命名新建对象，后续用 "$别名" 引用（如 projectIds、itemId）。也可直接使用上下文里的 UUID，或用准确的待办标题 / 项目名 / 分类名引用。create_item 可带 todayMode: today|focus|secondary；今日主要待办最多 3 个，超出用 secondary。
示例：
\`\`\`json
[
  {"action":"create_project","as":"react","name":"学 React","desiredOutcome":"能独立做简单组件"},
  {"action":"create_item","title":"搭好开发环境","projectIds":["$react"],"todayMode":"today"},
  {"action":"create_item","title":"学 JSX","projectIds":["$react"],"todayMode":"today"}
]
\`\`\`
按名称设置分类示例：
\`\`\`json
{"action":"set_item_categories","itemId":"学 JSX","categoryIds":["学习"]}
\`\`\`
create_project 只创建项目骨架，必填 name 与 desiredOutcome（可观察的成功标准）。用户想要计划/项目但目标、频率或成功标准不清楚时，先用 1～3 个简短问题追问，不要附加不完整的 create_project，也不要用操作失败的口吻说话；信息够了再创建。若用户同时要待办，用 create_item 另建并用 projectIds 关联。禁止永久删除、导出、擅自改项目阶段结构。其他操作信息不足时也先追问，不要附加代码块。`
  const capability =
    settings.aiPermission === "open"
      ? `当前为开放模式。支持 action：create_habit, create_item, create_project, update_item, set_today(mode: today|focus|secondary|clear), trash_item, set_item_categories, complete_item, archive_item, update_project_progress, propose_memory。除 trash_item 外，附加操作块后服务器会立即执行；archive_item 会立即归档。trash_item（软删进回收站）仍须附加操作块，服务器会挂起并由界面确认后执行——不要只口头问「确认吗」而不附代码块。${protocol}`
      : `当前为保守模式。用户明确要求且信息足够时可附加操作块，但服务器只会挂起待用户确认后执行。支持非删除操作：create_habit, create_item, create_project, update_item, set_today, set_item_categories, complete_item, update_project_progress, propose_memory。不要输出 trash_item 或 archive_item；若用户要求删除/归档，说明需切换到开放模式（删除仍需确认）。${protocol}`
  return `${identity}${honesty}${focusHint}${capability}以下是本次允许参考的本地上下文：${contextPrompt}`
}
