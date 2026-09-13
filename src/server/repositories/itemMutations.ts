import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { Item, ParsedCreateItemInput, UpdateItemInput } from "../../shared/items.js"
import { scheduleFieldsSchema } from "../../shared/taskCore.js"
import {
  ItemHasOpenSubtasksError,
  ItemParentConflictError,
  ItemVersionConflictError,
} from "./taskErrors.js"

const parentRowSchema = z.object({
  parent_id: z.string().nullable(),
  status: z.string(),
  deleted_at: z.string().nullable(),
})
const countSchema = z.object({ count: z.number().int().nonnegative() })
const reminderRowSchema = z.object({
  id: z.string(),
  anchor: z.enum(["due", "scheduled"]),
  offset_minutes: z.number().int(),
  version: z.number().int(),
})

export function normalizedInstant(value: string | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString()
}

export function createPayloadJson(input: ParsedCreateItemInput): string {
  const { requestId: _requestId, ...payload } = input
  return JSON.stringify(payload)
}

export function assertExpectedVersion(item: Item, expectedVersion: number | undefined): void {
  if (expectedVersion !== undefined && item.version !== expectedVersion) {
    throw new ItemVersionConflictError(item.id, item.version)
  }
}

export function assertParentAllowed(
  database: DatabaseSync,
  itemId: string,
  parentId: string | null,
): void {
  if (parentId === null) return
  if (parentId === itemId) throw new ItemParentConflictError(itemId, "任务不能成为自己的父任务")
  const raw = database
    .prepare("SELECT parent_id, status, deleted_at FROM items WHERE id = ?")
    .get(parentId)
  if (raw === undefined) throw new ItemParentConflictError(itemId, "父任务不存在")
  const parent = parentRowSchema.parse(raw)
  if (parent.deleted_at !== null)
    throw new ItemParentConflictError(itemId, "不能使用已删除的父任务")
  if (parent.status !== "active")
    throw new ItemParentConflictError(itemId, "父任务必须处于未完成状态")
  if (parent.parent_id !== null) throw new ItemParentConflictError(itemId, "子任务只能有一层")
  const childCount = countSchema.parse(
    database
      .prepare("SELECT COUNT(*) AS count FROM items WHERE parent_id=? AND deleted_at IS NULL")
      .get(itemId),
  ).count
  if (childCount > 0) throw new ItemParentConflictError(itemId, "已有子任务的任务不能再成为子任务")
  const createsCycle = database
    .prepare("SELECT 1 FROM items WHERE id = ? AND parent_id = ?")
    .get(parentId, itemId)
  if (createsCycle !== undefined)
    throw new ItemParentConflictError(itemId, "父子任务关系不能形成循环")
}

export function assertCanComplete(
  database: DatabaseSync,
  itemId: string,
  status: UpdateItemInput["status"],
): void {
  if (status !== "completed") return
  const open = countSchema.parse(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM items WHERE parent_id = ? AND status != 'completed' AND deleted_at IS NULL",
      )
      .get(itemId),
  ).count
  if (open > 0) throw new ItemHasOpenSubtasksError(itemId)
}

export function assertMergedTaskState(state: {
  readonly dueAt: string | null
  readonly dueDate: string | null
  readonly scheduledStartAt: string | null
  readonly scheduledEndAt: string | null
  readonly scheduleTimezone: string | null
  readonly isFixed: boolean
  readonly reminders: readonly {
    readonly anchor: "due" | "scheduled"
    readonly offsetMinutes: number
  }[]
}): void {
  if (state.dueAt !== null && state.dueDate !== null) {
    throw new z.ZodError([
      { code: "custom", path: ["dueDate"], message: "时间截止和日期截止不能同时设置" },
    ])
  }
  scheduleFieldsSchema.parse(state)
  for (const rule of state.reminders) {
    if (rule.anchor === "due" && state.dueAt === null) {
      throw new z.ZodError([
        { code: "custom", path: ["reminders"], message: "截止提醒需要时间截止" },
      ])
    }
    if (rule.anchor === "scheduled" && state.scheduledStartAt === null) {
      throw new z.ZodError([
        { code: "custom", path: ["reminders"], message: "安排提醒需要安排时段" },
      ])
    }
  }
}

export function replaceCategoryRelations(
  database: DatabaseSync,
  itemId: Item["id"],
  categoryIds: ParsedCreateItemInput["categoryIds"],
): void {
  database.prepare("DELETE FROM item_categories WHERE item_id = ?").run(itemId)
  const statement = database.prepare(
    "INSERT INTO item_categories (item_id, category_id, sort_order) VALUES (?, ?, ?)",
  )
  categoryIds.forEach((categoryId, index) => {
    statement.run(itemId, categoryId, index)
  })
}

export function replaceProjectRelations(
  database: DatabaseSync,
  itemId: Item["id"],
  projectIds: ParsedCreateItemInput["projectIds"],
): void {
  database.prepare("DELETE FROM item_projects WHERE item_id = ?").run(itemId)
  const statement = database.prepare(
    "INSERT INTO item_projects (item_id, project_id) VALUES (?, ?)",
  )
  for (const projectId of projectIds) statement.run(itemId, projectId)
}

export function replaceReminderRules(
  database: DatabaseSync,
  itemId: Item["id"],
  rules: readonly { readonly anchor: "due" | "scheduled"; readonly offsetMinutes: number }[],
  now: string,
): void {
  const existing = database
    .prepare("SELECT id,anchor,offset_minutes,version FROM task_reminder_rules WHERE item_id=?")
    .all(itemId)
    .map((row) => reminderRowSchema.parse(row))
  const desiredKeys = new Set(rules.map((rule) => `${rule.anchor}:${rule.offsetMinutes}`))
  const deleteStatement = database.prepare("DELETE FROM task_reminder_rules WHERE id=?")
  for (const rule of existing)
    if (!desiredKeys.has(`${rule.anchor}:${rule.offset_minutes}`)) deleteStatement.run(rule.id)
  const existingKeys = new Set(existing.map((rule) => `${rule.anchor}:${rule.offset_minutes}`))
  const statement = database.prepare(
    `INSERT INTO task_reminder_rules
     (id, item_id, anchor, offset_minutes, version, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
  )
  for (const rule of rules)
    if (!existingKeys.has(`${rule.anchor}:${rule.offsetMinutes}`))
      statement.run(crypto.randomUUID(), itemId, rule.anchor, rule.offsetMinutes, now, now)
}

export function bumpReminderRuleVersions(
  database: DatabaseSync,
  itemId: Item["id"],
  anchors: readonly ("due" | "scheduled")[],
  now: string,
): void {
  const statement = database.prepare(
    "UPDATE task_reminder_rules SET version=version+1,updated_at=? WHERE item_id=? AND anchor=?",
  )
  for (const anchor of anchors) statement.run(now, itemId, anchor)
}
