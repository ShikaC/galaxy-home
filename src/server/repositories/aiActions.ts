import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { aiActionSchema } from "../../shared/ai.js"
import { categoryIdSchema, itemIdSchema, itemStatusSchema } from "../../shared/items.js"
import { replaceItemCategories } from "./categories.js"
import {
  projectMatchesSnapshot,
  projectUndoPayloadSchema,
  restoreProjectSnapshot,
} from "./projectAiSnapshots.js"
import { clearTodayItem, setTodayItem } from "./todayItems.js"
import { restoreTrash } from "./trash.js"

const actionRowSchema = z.object({
  id: z.string().uuid(),
  action_type: z.string(),
  reason: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  undo_payload_json: z.string(),
  created_at: z.string(),
  undone_at: z.string().nullable(),
})

export const reviewSnapshotSchema = z.object({
  id: z.string().uuid(),
  week_start: z.string(),
  summary: z.string(),
  completed_json: z.string(),
  obstacles_json: z.string(),
  suggestions_json: z.string(),
  source: z.enum(["manual", "ai"]),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
})

const reviewUndoPayloadSchema = z.object({
  kind: z.literal("weekly_review"),
  previous: reviewSnapshotSchema.nullable(),
  expected: reviewSnapshotSchema.nullable().default(null),
})
const createHabitUndoPayloadSchema = z.object({
  kind: z.literal("create_habit"),
  habitId: z.string().uuid(),
  name: z.string(),
})
const createItemUndoPayloadSchema = z.object({
  kind: z.literal("create_item"),
  itemId: z.string().uuid(),
  title: z.string(),
})
const updateItemUndoPayloadSchema = z.object({
  kind: z.literal("update_item"),
  itemId: z.string().uuid(),
  previousTitle: z.string(),
  previousNotes: z.string().nullable(),
})
const setTodayUndoPayloadSchema = z.object({
  kind: z.literal("set_today"),
  itemId: z.string().uuid(),
  localDate: z.string(),
  previous: z.object({
    inToday: z.boolean(),
    isFocus: z.boolean(),
    isSecondary: z.boolean(),
  }),
})
const trashItemUndoPayloadSchema = z.object({
  kind: z.literal("trash_item"),
  itemId: z.string().uuid(),
  trashId: z.string().uuid(),
  title: z.string(),
})
const setCategoriesUndoPayloadSchema = z.object({
  kind: z.literal("set_item_categories"),
  itemId: z.string().uuid(),
  previousCategoryIds: z.array(z.string().uuid()),
})
const itemStatusUndoPayloadSchema = z.object({
  kind: z.literal("item_status"),
  itemId: z.string().uuid(),
  previousStatus: itemStatusSchema,
  previousCompletedAt: z.string().nullable(),
})
const projectProgressUndoPayloadSchema = z.object({
  kind: z.literal("update_project_progress"),
  projectId: z.string().uuid(),
  previousProgress: z.number().int(),
})
const createProjectUndoPayloadSchema = z.object({
  kind: z.literal("create_project"),
  projectId: z.string().uuid(),
  name: z.string(),
})
const reviewConvertUndoPayloadSchema = z.object({
  kind: z.literal("review_suggestion_convert"),
  reviewId: z.string().uuid(),
  suggestionId: z.string(),
  entityType: z.enum(["item", "habit", "project"]),
  entityId: z.string().uuid(),
})

const undoPayloadSchema = z.discriminatedUnion("kind", [
  reviewUndoPayloadSchema,
  projectUndoPayloadSchema,
  createHabitUndoPayloadSchema,
  createItemUndoPayloadSchema,
  updateItemUndoPayloadSchema,
  setTodayUndoPayloadSchema,
  trashItemUndoPayloadSchema,
  setCategoriesUndoPayloadSchema,
  itemStatusUndoPayloadSchema,
  projectProgressUndoPayloadSchema,
  createProjectUndoPayloadSchema,
  reviewConvertUndoPayloadSchema,
])

export class AiActionUnavailableError extends Error {
  readonly name = "AiActionUnavailableError"
}

function parseAction(raw: unknown) {
  const row = actionRowSchema.parse(raw)
  return aiActionSchema.parse({
    id: row.id,
    actionType: row.action_type,
    reason: row.reason,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: row.created_at,
    undoneAt: row.undone_at,
  })
}

export function listAiActions(database: DatabaseSync) {
  return database
    .prepare("SELECT * FROM ai_action_log ORDER BY created_at DESC, rowid DESC LIMIT 100")
    .all()
    .map(parseAction)
}

export function getReviewSnapshot(database: DatabaseSync, weekStart: string) {
  return reviewSnapshotSchema
    .nullable()
    .parse(
      database.prepare("SELECT * FROM weekly_reviews WHERE week_start = ?").get(weekStart) ?? null,
    )
}

export function recordReviewAction(
  database: DatabaseSync,
  reviewId: string,
  previous: z.infer<typeof reviewSnapshotSchema> | null,
): void {
  const now = new Date().toISOString()
  const expected = reviewSnapshotSchema.parse(
    database.prepare("SELECT * FROM weekly_reviews WHERE id = ?").get(reviewId),
  )
  database
    .prepare(
      `INSERT INTO ai_action_log
       (id, action_type, reason, entity_type, entity_id, undo_payload_json, created_at)
       VALUES (?, 'generate_weekly_review', '根据本周本地记录生成 AI 周回顾', 'review', ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      reviewId,
      JSON.stringify({ kind: "weekly_review", previous, expected }),
      now,
    )
}

export function recordReviewConvertAction(
  database: DatabaseSync,
  reviewId: string,
  suggestionId: string,
  entityType: "item" | "habit" | "project",
  entityId: string,
): void {
  database
    .prepare(
      `INSERT INTO ai_action_log
       (id, action_type, reason, entity_type, entity_id, undo_payload_json, created_at)
       VALUES (?, 'review_suggestion_convert', ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      `采纳周回顾建议并创建${entityType}`,
      entityType,
      entityId,
      JSON.stringify({
        kind: "review_suggestion_convert",
        reviewId,
        suggestionId,
        entityType,
        entityId,
      }),
      new Date().toISOString(),
    )
}

function reviewMatchesSnapshot(
  database: DatabaseSync,
  reviewId: string,
  expected: z.infer<typeof reviewSnapshotSchema>,
): boolean {
  const current = reviewSnapshotSchema
    .nullable()
    .parse(database.prepare("SELECT * FROM weekly_reviews WHERE id = ?").get(reviewId) ?? null)
  return JSON.stringify(current) === JSON.stringify(expected)
}

function restoreReview(
  database: DatabaseSync,
  reviewId: string,
  payload: z.infer<typeof reviewUndoPayloadSchema>,
) {
  if (payload.previous === null) {
    database.prepare("DELETE FROM weekly_reviews WHERE id = ?").run(reviewId)
    return
  }
  const row = payload.previous
  database
    .prepare(
      `INSERT INTO weekly_reviews
       (id, week_start, summary, completed_json, obstacles_json, suggestions_json,
        source, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET week_start = excluded.week_start, summary = excluded.summary,
       completed_json = excluded.completed_json, obstacles_json = excluded.obstacles_json,
       suggestions_json = excluded.suggestions_json, source = excluded.source,
       created_at = excluded.created_at, updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    )
    .run(
      row.id,
      row.week_start,
      row.summary,
      row.completed_json,
      row.obstacles_json,
      row.suggestions_json,
      row.source,
      row.created_at,
      row.updated_at,
      row.deleted_at,
    )
}

export function undoAiAction(database: DatabaseSync, actionId: string): void {
  const row = actionRowSchema
    .optional()
    .parse(
      database
        .prepare("SELECT * FROM ai_action_log WHERE id = ? AND undone_at IS NULL")
        .get(actionId),
    )
  if (row === undefined) throw new AiActionUnavailableError("该操作已经撤销或不存在")
  const payload = undoPayloadSchema.parse(JSON.parse(row.undo_payload_json))
  database.exec("BEGIN IMMEDIATE")
  try {
    const latest = z.object({ id: z.string().uuid() }).parse(
      database
        .prepare(
          `SELECT id FROM ai_action_log
           WHERE entity_type = ? AND entity_id = ? AND undone_at IS NULL
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(row.entity_type, row.entity_id),
    )
    if (latest.id !== row.id) throw new AiActionUnavailableError("请先撤销该对象最近的一次 AI 操作")
    const now = new Date().toISOString()
    if (payload.kind === "weekly_review") {
      if (row.action_type !== "generate_weekly_review")
        throw new AiActionUnavailableError("操作记录与撤销数据不匹配")
      if (
        payload.expected === null ||
        !reviewMatchesSnapshot(database, row.entity_id, payload.expected)
      )
        throw new AiActionUnavailableError("回顾已被后续修改，无法安全撤销该 AI 操作")
      restoreReview(database, row.entity_id, payload)
    } else if (payload.kind === "create_habit") {
      if (row.action_type !== "create_habit")
        throw new AiActionUnavailableError("操作记录与撤销数据不匹配")
      const habit = z
        .object({ id: z.string().uuid(), name: z.string(), deleted_at: z.string().nullable() })
        .optional()
        .parse(
          database
            .prepare("SELECT id, name, deleted_at FROM habits WHERE id = ?")
            .get(payload.habitId),
        )
      if (habit === undefined || habit.deleted_at !== null)
        throw new AiActionUnavailableError("习惯已不存在或已被删除，无法撤销该 AI 操作")
      if (habit.name !== payload.name)
        throw new AiActionUnavailableError("习惯已被后续修改，无法安全撤销该 AI 操作")
      database
        .prepare("UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, payload.habitId)
    } else if (payload.kind === "create_item") {
      const item = z
        .object({ title: z.string(), deleted_at: z.string().nullable() })
        .optional()
        .parse(
          database
            .prepare("SELECT title, deleted_at FROM items WHERE id = ?")
            .get(payload.itemId),
        )
      if (item === undefined || item.deleted_at !== null || item.title !== payload.title)
        throw new AiActionUnavailableError("待办已不存在或已被修改，无法撤销该 AI 操作")
      database
        .prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, payload.itemId)
    } else if (payload.kind === "update_item") {
      database
        .prepare("UPDATE items SET title = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .run(payload.previousTitle, payload.previousNotes, now, payload.itemId)
    } else if (payload.kind === "set_today") {
      clearTodayItem(database, payload.itemId, payload.localDate)
      if (payload.previous.inToday) {
        if (payload.previous.isSecondary)
          setTodayItem(database, {
            itemId: itemIdSchema.parse(payload.itemId),
            localDate: payload.localDate,
            isFocus: false,
            isSecondary: true,
          })
        else
          setTodayItem(database, {
            itemId: itemIdSchema.parse(payload.itemId),
            localDate: payload.localDate,
            isFocus: payload.previous.isFocus,
            isSecondary: false,
          })
      }
    } else if (payload.kind === "trash_item") {
      restoreTrash(database, payload.trashId)
    } else if (payload.kind === "set_item_categories") {
      replaceItemCategories(
        database,
        itemIdSchema.parse(payload.itemId),
        payload.previousCategoryIds.map((id) => categoryIdSchema.parse(id)),
      )
    } else if (payload.kind === "item_status") {
      database
        .prepare(
          "UPDATE items SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        )
        .run(payload.previousStatus, payload.previousCompletedAt, now, payload.itemId)
    } else if (payload.kind === "update_project_progress") {
      database
        .prepare("UPDATE projects SET progress = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .run(payload.previousProgress, now, payload.projectId)
    } else if (payload.kind === "create_project") {
      const project = z
        .object({ name: z.string(), deleted_at: z.string().nullable() })
        .optional()
        .parse(
          database
            .prepare("SELECT name, deleted_at FROM projects WHERE id = ?")
            .get(payload.projectId),
        )
      if (project === undefined || project.deleted_at !== null || project.name !== payload.name)
        throw new AiActionUnavailableError("项目已不存在或已被修改，无法撤销该 AI 操作")
      database
        .prepare("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, payload.projectId)
    } else if (payload.kind === "review_suggestion_convert") {
      const table =
        payload.entityType === "item"
          ? "items"
          : payload.entityType === "habit"
            ? "habits"
            : "projects"
      database
        .prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`)
        .run(now, now, payload.entityId)
      database
        .prepare(
          "DELETE FROM review_suggestion_conversions WHERE review_id = ? AND suggestion_id = ?",
        )
        .run(payload.reviewId, payload.suggestionId)
    } else {
      if (
        row.action_type !== "apply_project_plan" &&
        row.action_type !== "advance_project_feedback"
      )
        throw new AiActionUnavailableError("操作记录与撤销数据不匹配")
      if (payload.expected === null || !projectMatchesSnapshot(database, payload.expected))
        throw new AiActionUnavailableError("项目已被后续修改，无法安全撤销该 AI 操作")
      restoreProjectSnapshot(database, payload.snapshot)
    }
    database
      .prepare("UPDATE ai_action_log SET undone_at = ? WHERE id = ?")
      .run(now, row.id)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
