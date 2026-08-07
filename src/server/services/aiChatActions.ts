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
} {
  const match = ACTION_BLOCK_PATTERN.exec(answer)
  if (match === null) return { text: answer.trimEnd(), actions: [] }
  const raw = match[1]
  if (raw === undefined) return { text: answer.trimEnd(), actions: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { text: answer.trimEnd(), actions: [] }
  }
  const text = answer.slice(0, match.index).trimEnd()
  const candidates = Array.isArray(parsed) ? parsed : [parsed]
  if (candidates.length === 0 || candidates.length > MAX_ACTIONS_PER_TURN) {
    return { text: answer.trimEnd(), actions: [] }
  }
  const actions: ChatAction[] = []
  for (const candidate of candidates) {
    const action = chatActionSchema.safeParse(candidate)
    if (!action.success) return { text: answer.trimEnd(), actions: [] }
    actions.push(action.data)
  }
  return { text, actions }
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
  return actions.map(summarizeAction).join("；")
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
          categoryIds: action.categoryIds.map((id) =>
            categoryIdSchema.parse(resolveEntityRef(id, refs)),
          ),
          projectIds: action.projectIds.map((id) =>
            projectIdSchema.parse(resolveEntityRef(id, refs)),
          ),
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
      const itemId = resolveEntityRef(action.itemId, refs)
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
      const itemId = resolveEntityRef(action.itemId, refs)
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
      const itemId = resolveEntityRef(action.itemId, refs)
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
      const itemId = resolveEntityRef(action.itemId, refs)
      const before = getItem(database, itemId, localDate)
      replaceItemCategories(
        database,
        itemIdSchema.parse(itemId),
        action.categoryIds.map((id) => categoryIdSchema.parse(resolveEntityRef(id, refs))),
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
      const itemId = resolveEntityRef(action.itemId, refs)
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
      const projectId = resolveEntityRef(action.projectId, refs)
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

export function executeChatActions(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  actions: readonly ChatAction[],
): string {
  const refs = new Map<string, string>()
  const confirmations: string[] = []
  for (const action of actions) {
    if (action.action === "propose_memory") continue
    confirmations.push(executeChatAction(database, settings, action, refs))
  }
  if (confirmations.length === 0) throw new Error("没有可执行的操作")
  return confirmations.join("\n")
}

export function applyAiChatActions(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  answer: string,
): ApplyChatActionsResult {
  const extracted = extractChatActions(answer)
  if (extracted.actions.length === 0) {
    const text = extracted.text === "" ? answer.trim() : extracted.text
    if (!claimsCompletedMutation(text))
      return { text, pendingAction: null, proposedMemory: null }
    return {
      text: `${text}\n\n（说明：本次没有改动你的工作空间数据。开放模式下若要真正执行，请再发一次并附上操作块。）`,
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
  const summary = summarizeActions(executable)
  if (settings.aiPermission !== "open") {
    const base =
      extracted.text === ""
        ? `我准备执行 ${executable.length} 项改动，需要你确认。`
        : extracted.text
    return {
      text: `${base}\n\n（待确认：${summary}）`,
      pendingAction: { status: "pending", actions: executable, summary },
      proposedMemory,
    }
  }
  try {
    const confirmation = executeChatActions(database, settings, executable)
    return {
      text:
        extracted.text === "" ? confirmation : `${extracted.text}\n\n${confirmation}`,
      pendingAction: null,
      proposedMemory,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败"
    return {
      text: `${extracted.text === "" ? "" : `${extracted.text}\n\n`}（未能执行：${message}）`,
      pendingAction: null,
      proposedMemory: null,
    }
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
支持 action：create_habit, create_item, create_project, update_item, set_today(mode: today|focus|secondary|clear), trash_item, set_item_categories, complete_item, archive_item, update_project_progress, propose_memory。
同一批内可用 "as":"别名" 命名新建对象，后续用 "$别名" 引用（如 projectIds、itemId）。create_item 可带 todayMode: today|focus|secondary；今日主要待办最多 3 个，超出用 secondary。
示例：
\`\`\`json
[
  {"action":"create_project","as":"react","name":"学 React","desiredOutcome":"能独立做简单组件"},
  {"action":"create_item","title":"搭好开发环境","projectIds":["$react"],"todayMode":"today"},
  {"action":"create_item","title":"学 JSX","projectIds":["$react"],"todayMode":"today"}
]
\`\`\`
create_project 只创建项目骨架；若用户同时要待办，用 create_item 另建并用 projectIds 关联。trash_item 只软删进回收站；禁止永久删除、导出、擅自改项目阶段结构。信息不足时先追问，不要附加代码块。`
  const capability =
    settings.aiPermission === "open"
      ? `当前为开放模式。用户明确要求且信息足够时，附加操作块，服务器会真正执行。${protocol}`
      : `当前为保守模式。用户明确要求且信息足够时可附加操作块，但服务器只会挂起待用户确认后执行。${protocol}`
  return `${identity}${honesty}${focusHint}${capability}以下是本次允许参考的本地上下文：${contextPrompt}`
}
