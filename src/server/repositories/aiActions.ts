import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { aiActionSchema } from "../../shared/ai.js"
import { projectUndoPayloadSchema, restoreProjectSnapshot } from "./projectAiSnapshots.js"

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
})
const undoPayloadSchema = z.discriminatedUnion("kind", [
  reviewUndoPayloadSchema,
  projectUndoPayloadSchema,
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
    .prepare("SELECT * FROM ai_action_log ORDER BY created_at DESC LIMIT 100")
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
  database
    .prepare(
      `INSERT INTO ai_action_log
       (id, action_type, reason, entity_type, entity_id, undo_payload_json, created_at)
       VALUES (?, 'generate_weekly_review', '根据本周本地记录生成 AI 周回顾', 'review', ?, ?, ?)`,
    )
    .run(crypto.randomUUID(), reviewId, JSON.stringify({ kind: "weekly_review", previous }), now)
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
  database.exec("BEGIN IMMEDIATE")
  try {
    if (payload.kind === "weekly_review") {
      if (row.action_type !== "generate_weekly_review")
        throw new AiActionUnavailableError("操作记录与撤销数据不匹配")
      restoreReview(database, row.entity_id, payload)
    } else {
      if (
        row.action_type !== "apply_project_plan" &&
        row.action_type !== "advance_project_feedback"
      )
        throw new AiActionUnavailableError("操作记录与撤销数据不匹配")
      restoreProjectSnapshot(database, payload.snapshot)
    }
    database
      .prepare("UPDATE ai_action_log SET undone_at = ? WHERE id = ?")
      .run(new Date().toISOString(), row.id)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
