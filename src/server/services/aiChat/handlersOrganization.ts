// 由 aiChatActions.ts 按职责拆分；对外入口仍是 services/aiChatActions.ts。

import { z } from "zod"
import type { ChatAction } from "../../../shared/aiChatActions.js"
import { createHabitInputSchema } from "../../../shared/habits.js"
import { categoryIdSchema, createCategoryInputSchema } from "../../../shared/items.js"
import { createProjectInputSchema } from "../../../shared/projects.js"
import { createCategory } from "../../repositories/categories.js"
import { createHabit, getHabit, recordHabit } from "../../repositories/habits.js"
import { createProject, updateProjectProgress } from "../../repositories/projects.js"
import type { ChatActionContext } from "./context.js"
import { rememberAlias, resolveHabitRef, resolveProjectRef } from "./refs.js"
import { recordAction, summarizeAction } from "./summary.js"

export function runCreateHabit(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "create_habit" }>,
): string {
  const habit = createHabit(
    context.database,
    createHabitInputSchema.parse({
      name: action.name,
      type: action.type,
      targetCount: action.targetCount,
      frequencyType: action.frequencyType,
      weeklyTarget: action.weeklyTarget,
      restDays: action.restDays,
    }),
    context.localDate,
  )
  rememberAlias(context.refs, action.as, habit.id)
  recordAction(context.database, "create_habit", `创建习惯「${habit.name}」`, "habit", habit.id, {
    kind: "create_habit",
    habitId: habit.id,
    name: habit.name,
  })
  return `已实际创建习惯「${habit.name}」，可在操作记录中撤销。`
}

export function runCompleteHabit(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "complete_habit" }>,
): string {
  const habitId = resolveHabitRef(context.database, action.habitId, context.refs)
  const habitDate = action.localDate ?? context.localDate
  const previousRow = context.database
    .prepare(
      `SELECT count, status, corrected FROM habit_logs
       WHERE habit_id = ? AND local_date = ?`,
    )
    .get(habitId)
  const previous =
    previousRow === undefined
      ? null
      : z
          .object({
            count: z.number().int().nonnegative(),
            status: z.enum(["active", "leave"]),
            corrected: z.number().int().min(0).max(1),
          })
          .parse(previousRow)
  recordHabit(context.database, habitId, habitDate)
  const habit = getHabit(context.database, habitId, habitDate)
  recordAction(context.database, "complete_habit", `完成习惯「${habit.name}」`, "habit", habitId, {
    kind: "complete_habit",
    habitId,
    localDate: habitDate,
    previous,
  })
  if (habit.type === "count" && !habit.completedToday) {
    return `已记录习惯「${habit.name}」1 次，今天累计 ${habit.currentCount}/${habit.targetCount}，可在操作记录中撤销。`
  }
  return `已完成习惯「${habit.name}」，可在操作记录中撤销。`
}

export function runCreateCategory(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "create_category" }>,
): string {
  const existing = z
    .object({ id: categoryIdSchema, name: z.string() })
    .optional()
    .parse(
      context.database
        .prepare(
          "SELECT id, name FROM categories WHERE deleted_at IS NULL AND name = ? ORDER BY updated_at DESC LIMIT 1",
        )
        .get(action.name),
    )
  if (existing !== undefined) {
    rememberAlias(context.refs, action.as, existing.id)
    return `已有分类「${existing.name}」，未重复创建。`
  }
  const category = createCategory(
    context.database,
    createCategoryInputSchema.parse({
      name: action.name,
      color: action.color,
      icon: action.icon,
    }),
  )
  rememberAlias(context.refs, action.as, category.id)
  recordAction(
    context.database,
    "create_category",
    `创建分类「${category.name}」`,
    "category",
    category.id,
    { kind: "create_category", categoryId: category.id, name: category.name },
  )
  return `已实际创建分类「${category.name}」，可在操作记录中撤销。`
}

export function runUpdateProjectProgress(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "update_project_progress" }>,
): string {
  const projectId = resolveProjectRef(context.database, action.projectId, context.refs)
  const before = z
    .object({ progress: z.number().int() })
    .parse(
      context.database
        .prepare("SELECT progress FROM projects WHERE id = ? AND deleted_at IS NULL")
        .get(projectId),
    )
  updateProjectProgress(context.database, projectId, action.progress)
  recordAction(
    context.database,
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

export function runCreateProject(
  context: ChatActionContext,
  action: Extract<ChatAction, { action: "create_project" }>,
): string {
  const project = createProject(
    context.database,
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
  rememberAlias(context.refs, action.as, project.id)
  recordAction(
    context.database,
    "create_project",
    `创建项目「${project.name}」`,
    "project",
    project.id,
    {
      kind: "create_project",
      projectId: project.id,
      name: project.name,
    },
  )
  return `已实际创建项目「${project.name}」，可在操作记录中撤销。`
}
