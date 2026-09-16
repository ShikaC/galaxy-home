// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。
import type { DatabaseSync } from "node:sqlite"
import type { ChatAction, PendingChatAction } from "../../../shared/aiChatActions.js"
import { DEFAULT_AI_PERSONALITY_PROMPT, type WorkspaceSettings } from "../../../shared/settings.js"
import {
  executeChatActions,
  isConservativeBlockedAction,
  isOpenConfirmAction,
  partitionBy,
} from "./execute.js"
import {
  extractChatActions,
  looksLikeClarifyingQuestions,
  MAX_ACTIONS_PER_TURN,
} from "./parsing.js"
import { claimsCompletedMutation, summarizeActions } from "./summary.js"

export type ApplyChatActionsResult = {
  readonly text: string
  readonly pendingAction: PendingChatAction | null
  readonly proposedMemory: Extract<ChatAction, { action: "propose_memory" }> | null
}

function withSkippedNote(text: string, skippedInvalidCount: number): string {
  if (skippedInvalidCount <= 0) return text
  const note = `（另有 ${skippedInvalidCount} 个操作因格式不完整已跳过，其余已按有效项处理。）`
  return text === "" ? note : `${text}\n\n${note}`
}

export function applyAiChatActions(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  answer: string,
  instant = new Date(),
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
    if (!claimsCompletedMutation(text)) return { text, pendingAction: null, proposedMemory: null }
    return {
      text: `${text}\n\n（说明：本次没有改动你的工作空间数据。若要真正执行，请再发一次并附上操作块；保守模式下还需确认。）`,
      pendingAction: null,
      proposedMemory: null,
    }
  }
  const proposedMemory =
    [...extracted.actions]
      .reverse()
      .find(
        (action): action is Extract<ChatAction, { action: "propose_memory" }> =>
          action.action === "propose_memory",
      ) ?? null
  const executable = extracted.actions.filter((action) => action.action !== "propose_memory")
  if (executable.length === 0) {
    return {
      text: extracted.text === "" ? "我建议把这条记为长期记忆，确认后才会保存。" : extracted.text,
      pendingAction: null,
      proposedMemory,
    }
  }
  if (settings.aiPermission !== "open") {
    const { matched: blocked, rest: allowed } = partitionBy(executable, isConservativeBlockedAction)
    const blockedNote =
      blocked.length === 0
        ? ""
        : `（保守模式不支持删除或归档：已跳过 ${summarizeActions(blocked)}。如需删除请切换到开放模式并确认后执行。）`
    if (allowed.length === 0) {
      const base = extracted.text === "" ? "" : `${extracted.text}\n\n`
      return {
        text: withSkippedNote(
          `${base}${blockedNote || "（保守模式不支持删除或归档，请切换到开放模式后再试。）"}`,
          extracted.skippedInvalidCount,
        ),
        pendingAction: null,
        proposedMemory,
      }
    }
    const summary = summarizeActions(allowed)
    const base =
      extracted.text === "" ? `我准备执行 ${allowed.length} 项改动，需要你确认。` : extracted.text
    return {
      text: withSkippedNote(
        `${base}\n\n（待确认：${summary}）${blockedNote === "" ? "" : `\n\n${blockedNote}`}`,
        extracted.skippedInvalidCount,
      ),
      pendingAction: { status: "pending", actions: [...allowed], summary },
      proposedMemory,
    }
  }
  const { matched: needsConfirm, rest: immediate } = partitionBy(executable, isOpenConfirmAction)
  let executedText = ""
  if (immediate.length > 0) {
    try {
      executedText = executeChatActions(database, settings, immediate, instant)
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败"
      return {
        text: withSkippedNote(
          `${extracted.text === "" ? "" : `${extracted.text}\n\n`}（未能执行：${message}。本次未写入；可调整后重试。）`,
          extracted.skippedInvalidCount,
        ),
        pendingAction: null,
        proposedMemory: null,
      }
    }
  }
  if (needsConfirm.length === 0) {
    const combined =
      extracted.text === ""
        ? executedText
        : executedText === ""
          ? extracted.text
          : `${extracted.text}\n\n${executedText}`
    return {
      text: withSkippedNote(combined, extracted.skippedInvalidCount),
      pendingAction: null,
      proposedMemory,
    }
  }
  const summary = summarizeActions(needsConfirm)
  const parts = [extracted.text, executedText, `（待确认：${summary}）`].filter(
    (part) => part !== "",
  )
  return {
    text: withSkippedNote(parts.join("\n\n"), extracted.skippedInvalidCount),
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
  const protocol = `可在回复末尾附加一个 JSON 代码块：单个操作对象，或最多 ${MAX_ACTIONS_PER_TURN} 个操作的数组（按顺序执行）。用户一次要求多项改动时，必须在同一数组里写全，不要只做第一步。只要用户要求创建、修改、归类、排今日、完成习惯等数据改动，就必须附操作块；没有操作块时只能说明尚未改动，不能说“已完成/已安排/已记录”。
同一批内可用 "as":"别名" 命名新建对象，后续用 "$别名" 引用（如 projectIds、itemId）。也可直接使用上下文里的 UUID，或用准确的待办标题 / 项目名 / 分类名引用。create_item 可带 todayMode: today|focus|secondary；今日主要待办最多 3 个，超出请用 secondary（服务器也会自动把超额主要项降为次要）。
用户口语简短且意图清楚时（如「记一下买菜」「加个每天喝水的习惯」），用合理默认值直接执行，不要反复确认字段；习惯默认 frequencyType=daily、targetCount=1、weeklyTarget=null，单次勾选用 type=check，杯数/次数/页数等计量目标用 type=count。完成已有习惯使用 complete_habit，habitId 填习惯名称或上下文 UUID；创建分类使用 create_category，color 缺省时用 #2f7d5a、icon 缺省时用 tag。创建分类并归类待办时，必须在同一操作数组中先 create_category（可用 as 别名），再 set_item_categories；分类名称或待办名称不明确时才追问。排进今天必须使用 set_today，并填写 itemId 与 mode=today，例如 {"action":"set_today","itemId":"明天买菜","mode":"today"}。
写建议待办或关联任务时，标题避免与现有活跃待办完全相同；若只需推进已有事项，优先 complete_item / set_today，不要重复 create_item。
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
按标题引用待办时，优先匹配唯一活跃项；上下文中 item.status=active 才是当前可继续操作的候选，completed/archived 只作为历史记录，不要因为同名历史项追问。只有存在多个活跃同名待办且无法判断时才追问；同名多条活跃项取最近更新的活跃待办。create_project 只创建项目骨架，必填 name 与 desiredOutcome（可观察的成功标准）。用户想要计划/项目但目标、频率或成功标准不清楚时，先用 1～3 个简短问题追问，不要附加不完整的 create_project，也不要用操作失败的口吻说话；信息够了再创建。若用户同时要待办，用 create_item 另建并用 projectIds 关联。禁止永久删除、导出、擅自改项目阶段结构。`
  const capability =
    settings.aiPermission === "open"
      ? `当前为开放模式。支持 action：create_habit, complete_habit, create_category, create_item, create_project, update_item, set_today(mode: today|focus|secondary|clear), trash_item, set_item_categories, complete_item, archive_item, update_project_progress, propose_memory。除 trash_item 外，附加操作块后服务器会立即执行；archive_item 会立即归档。trash_item（软删进回收站）仍须附加操作块，服务器会挂起并由界面确认后执行——不要只口头问「确认吗」而不附代码块。${protocol}`
      : `当前为保守模式。用户明确要求且信息足够时可附加操作块，但服务器只会挂起待用户确认后执行。支持非删除操作：create_habit, complete_habit, create_category, create_item, create_project, update_item, set_today, set_item_categories, complete_item, update_project_progress, propose_memory。不要输出 trash_item 或 archive_item；若用户要求删除/归档，说明需切换到开放模式（删除仍需确认）。保守模式不提供工作区条目列表；用户给出准确待办标题时直接附上操作块；若用户使用标题的一部分且当前对话中只有一个明确匹配，使用当前对话中的完整标题直接附上操作块。创建分类并将已有待办归类时不要追问哪一条，直接在同一数组中创建分类并用待办完整标题关联。不要因为看不到列表而猜测重复或追问，由服务器解析唯一活跃项并在真正歧义时拦截。${protocol}`
  return `${identity}${honesty}${focusHint}${capability}以下是本次允许参考的本地上下文：${contextPrompt}`
}
