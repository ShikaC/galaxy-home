import { coerceEntityRef, coerceEntityRefList } from "./parsing.js"

export type ActionCandidateRecord = {
  action?: unknown
  category?: unknown
  categoryId?: unknown
  categoryIds?: unknown
  categoryName?: unknown
  categories?: unknown
  checkType?: unknown
  color?: unknown
  count?: unknown
  date?: unknown
  frequency?: unknown
  frequencyType?: unknown
  freq?: unknown
  goal?: unknown
  habit?: unknown
  habitId?: unknown
  habitType?: unknown
  icon?: unknown
  id?: unknown
  item?: unknown
  itemId?: unknown
  kind?: unknown
  localDate?: unknown
  mode?: unknown
  name?: unknown
  percent?: unknown
  project?: unknown
  projectId?: unknown
  projectIds?: unknown
  projects?: unknown
  progress?: unknown
  restDays?: unknown
  schedule?: unknown
  target?: unknown
  targetCount?: unknown
  times?: unknown
  title?: unknown
  today?: unknown
  todayMode?: unknown
  type?: unknown
  uuid?: unknown
  value?: unknown
  weekTarget?: unknown
  weeklyTarget?: unknown
  weekly_target?: unknown
}

export function normalizeActionCandidate(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw
  const value = { ...(raw as ActionCandidateRecord) }
  if (typeof value.action === "string") {
    const action = value.action
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
    const aliases: Record<string, string> = {
      create_todo: "create_item",
      add_item: "create_item",
      add_todo: "create_item",
      create_task: "create_item",
      add_task: "create_item",
      create_plan: "create_project",
      createproject: "create_project",
      createplan: "create_project",
      add_category: "create_category",
      create_tag: "create_category",
      createcategory: "create_category",
      create_label: "create_category",
      set_categories: "set_item_categories",
      set_category: "set_item_categories",
      set_item_category: "set_item_categories",
      update_item_categories: "set_item_categories",
      assign_categories: "set_item_categories",
      update_categories: "set_item_categories",
      delete_item: "trash_item",
      remove_item: "trash_item",
      soft_delete: "trash_item",
      mark_done: "complete_item",
      complete: "complete_item",
      finish_item: "complete_item",
      mark_habit_done: "complete_habit",
      record_habit: "complete_habit",
      check_in_habit: "complete_habit",
      add_to_today: "set_today",
      move_to_today: "set_today",
      schedule_today: "set_today",
    }
    value.action = aliases[action] ?? action
  }
  if (value.action === "create_habit") {
    if (value.type === undefined) {
      const typeAlias = value.habitType ?? value.kind ?? value.checkType
      if (typeof typeAlias === "string") value.type = typeAlias
    }
    if (typeof value.type === "string") {
      const type = value.type.trim().toLowerCase()
      if (type === "checkbox" || type === "tick" || type === "打卡" || type === "勾选") {
        value.type = "check"
      } else if (type === "counter" || type === "计数") {
        value.type = "count"
      }
    }
    if (value.frequencyType === undefined) {
      const frequencyAlias = value.frequency ?? value.freq ?? value.schedule
      if (typeof frequencyAlias === "string") value.frequencyType = frequencyAlias
    }
    if (typeof value.frequencyType === "string") {
      const frequency = value.frequencyType.trim().toLowerCase()
      if (["daily", "day", "everyday", "每天", "每日"].includes(frequency)) {
        value.frequencyType = "daily"
      } else if (["weekly", "week", "每周"].includes(frequency)) {
        value.frequencyType = "weekly"
      }
    }
    if (value.frequencyType === undefined) value.frequencyType = "daily"

    if (value.targetCount === undefined) {
      const targetAlias = value.target ?? value.count ?? value.times ?? value.goal
      if (typeof targetAlias === "number" || typeof targetAlias === "string") {
        value.targetCount = targetAlias
      }
    }
    if (typeof value.targetCount === "string" && value.targetCount.trim() !== "") {
      const parsed = Number(value.targetCount)
      if (Number.isFinite(parsed)) value.targetCount = parsed
    }
    if (value.targetCount === undefined) value.targetCount = 1
    if (value.type === undefined) {
      value.type = value.targetCount === 1 ? "check" : "count"
    }

    if (value.weeklyTarget === undefined) {
      const weeklyAlias = value.weekly_target ?? value.weekTarget
      if (
        weeklyAlias === null ||
        typeof weeklyAlias === "number" ||
        typeof weeklyAlias === "string"
      ) {
        value.weeklyTarget = weeklyAlias
      }
    }
    if (typeof value.weeklyTarget === "string" && value.weeklyTarget.trim() !== "") {
      const parsed = Number(value.weeklyTarget)
      if (Number.isFinite(parsed)) value.weeklyTarget = parsed
    }
    if (value.weeklyTarget === undefined) value.weeklyTarget = null
    if (value.frequencyType === "daily") value.weeklyTarget = null
    if (value.restDays === undefined) value.restDays = []
  }
  if (value.action === "complete_habit") {
    if (value.habitId === undefined) {
      const habitAlias = value.id ?? value.habit ?? value.name ?? value.title
      if (
        typeof habitAlias === "string" ||
        (habitAlias !== null && typeof habitAlias === "object")
      ) {
        value.habitId = habitAlias
      }
    }
    if (value.localDate === undefined && typeof value.date === "string") {
      value.localDate = value.date
    }
    value.habitId = coerceEntityRef(value.habitId)
  }
  if (value.action === "create_category") {
    if (value.name === undefined) {
      const categoryName = value.title ?? value.categoryName
      if (typeof categoryName === "string") value.name = categoryName
    }
    if (value.color === undefined) value.color = "#2f7d5a"
    if (typeof value.color === "string") {
      const colorAliases: Record<string, string> = {
        green: "#2f7d5a",
        blue: "#3b82f6",
        yellow: "#d97706",
        red: "#dc2626",
      }
      value.color = colorAliases[value.color.trim().toLowerCase()] ?? value.color
    }
    if (value.icon === undefined) value.icon = "tag"
  }
  if (value.action === "create_item") {
    if (value.projectIds === undefined) {
      const projectAlias = value.projectId ?? value.project ?? value.projects
      if (typeof projectAlias === "string") value.projectIds = [projectAlias]
      else if (Array.isArray(projectAlias)) value.projectIds = projectAlias
    }
    if (value.categoryIds === undefined) {
      const categoryAlias = value.categoryId ?? value.category ?? value.categories
      if (typeof categoryAlias === "string") value.categoryIds = [categoryAlias]
      else if (Array.isArray(categoryAlias)) value.categoryIds = categoryAlias
    }
    value.projectIds = coerceEntityRefList(value.projectIds)
    value.categoryIds = coerceEntityRefList(value.categoryIds)
    if (value.todayMode === undefined) {
      const todayAlias = value.today ?? value.mode
      if (typeof todayAlias === "string") value.todayMode = todayAlias
      else if (todayAlias === true) value.todayMode = "today"
    }
    if (typeof value.todayMode === "string") {
      const todayMode = value.todayMode.trim().toLowerCase()
      if (["today", "今日", "主要", "加入今日"].includes(todayMode)) value.todayMode = "today"
      else if (["focus", "焦点", "焦点待办"].includes(todayMode)) value.todayMode = "focus"
      else if (["secondary", "次要", "今日次要"].includes(todayMode)) value.todayMode = "secondary"
    }
    if (value.title === undefined && typeof value.name === "string") {
      value.title = value.name
    }
  }
  if (
    value.action === "update_item" ||
    value.action === "set_today" ||
    value.action === "trash_item" ||
    value.action === "complete_item" ||
    value.action === "archive_item" ||
    value.action === "set_item_categories"
  ) {
    if (value.itemId === undefined) {
      const itemAlias = value.id ?? value.item ?? value.title
      if (typeof itemAlias === "string" || (itemAlias !== null && typeof itemAlias === "object")) {
        value.itemId = itemAlias
      }
    }
    value.itemId = coerceEntityRef(value.itemId)
  }
  if (value.action === "set_item_categories") {
    if (value.categoryIds === undefined) {
      const categoryAlias = value.categories ?? value.categoryId ?? value.category
      if (categoryAlias !== undefined) value.categoryIds = categoryAlias
    }
    value.categoryIds = coerceEntityRefList(value.categoryIds)
  }
  if (value.action === "set_today") {
    if (value.mode === undefined) {
      const modeAlias = value.todayMode ?? value.today
      if (typeof modeAlias === "string") value.mode = modeAlias
      else if (modeAlias === true) value.mode = "today"
    }
    if (typeof value.mode === "string") {
      const mode = value.mode.trim().toLowerCase()
      if (["today", "今日", "主要", "加入今日"].includes(mode)) value.mode = "today"
      else if (["focus", "焦点", "焦点待办"].includes(mode)) value.mode = "focus"
      else if (["secondary", "次要", "今日次要"].includes(mode)) value.mode = "secondary"
      else if (["clear", "remove", "移出今日"].includes(mode)) value.mode = "clear"
    }
  }
  if (value.action === "update_project_progress") {
    if (value.projectId === undefined) {
      const projectAlias = value.id ?? value.project ?? value.name
      if (
        typeof projectAlias === "string" ||
        (projectAlias !== null && typeof projectAlias === "object")
      ) {
        value.projectId = projectAlias
      }
    }
    value.projectId = coerceEntityRef(value.projectId)
    if (value.progress === undefined) {
      const progressAlias = value.percent ?? value.value
      if (typeof progressAlias === "number" || typeof progressAlias === "string") {
        value.progress = progressAlias
      }
    }
    if (typeof value.progress === "string" && value.progress.trim() !== "") {
      const parsed = Number(value.progress.replace(/%/g, ""))
      if (Number.isFinite(parsed)) value.progress = parsed
    }
  }
  return value
}

/** @deprecated use extractChatActions */
