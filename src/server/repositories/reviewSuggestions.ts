import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { reviewSuggestionConversionSchema, reviewSuggestionSchema } from "../../shared/app.js"
import { recordReviewConvertAction } from "./aiActions.js"

const reviewRowSchema = z.object({ suggestions_json: z.string() })
const conversionRowSchema = z.object({
  review_id: z.string().uuid(),
  suggestion_id: z.string(),
  entity_type: z.enum(["item", "habit", "project"]),
  entity_id: z.string().uuid(),
  created_at: z.string(),
})

export class ReviewSuggestionUnavailableError extends Error {
  readonly name = "ReviewSuggestionUnavailableError"
}

function parseConversion(raw: unknown) {
  const row = conversionRowSchema.parse(raw)
  return reviewSuggestionConversionSchema.parse({
    reviewId: row.review_id,
    suggestionId: row.suggestion_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: row.created_at,
  })
}

function findConversion(database: DatabaseSync, reviewId: string, suggestionId: string) {
  const row = database
    .prepare(
      "SELECT * FROM review_suggestion_conversions WHERE review_id = ? AND suggestion_id = ?",
    )
    .get(reviewId, suggestionId)
  return row === undefined ? null : parseConversion(row)
}

function insertConvertedEntity(
  database: DatabaseSync,
  type: "item" | "habit" | "project",
  content: string,
  now: string,
): string {
  const entityId = crypto.randomUUID()
  if (type === "item") {
    database
      .prepare("INSERT INTO items (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(entityId, content, now, now)
    return entityId
  }
  if (type === "habit") {
    const order = z
      .object({ value: z.number().int() })
      .parse(
        database.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM habits").get(),
      ).value
    database
      .prepare(
        `INSERT INTO habits
         (id, name, type, target_count, frequency_type, weekly_target, rest_days_json,
          sort_order, created_at, updated_at)
         VALUES (?, ?, 'check', 1, 'daily', NULL, '[]', ?, ?, ?)`,
      )
      .run(entityId, content, order, now, now)
    return entityId
  }
  const stageId = crypto.randomUUID()
  database
    .prepare(
      `INSERT INTO projects (id, name, desired_outcome, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(entityId, content, content, now, now)
  database
    .prepare(
      `INSERT INTO project_stages
       (id, project_id, title, status, sort_order, created_at, updated_at)
       VALUES (?, ?, '迈出第一步', 'current', 0, ?, ?)`,
    )
    .run(stageId, entityId, now, now)
  const task = database.prepare(
    `INSERT INTO project_tasks
     (id, project_id, stage_id, title, position, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
  )
  task.run(crypto.randomUUID(), entityId, stageId, "明确最小可行动作", "current", now, now)
  task.run(crypto.randomUUID(), entityId, stageId, "完成后重新评估", "next", now, now)
  return entityId
}

export function convertReviewSuggestion(
  database: DatabaseSync,
  reviewId: string,
  suggestionId: string,
) {
  const existing = findConversion(database, reviewId, suggestionId)
  if (existing !== null) return existing
  const review = reviewRowSchema
    .optional()
    .parse(
      database
        .prepare("SELECT suggestions_json FROM weekly_reviews WHERE id = ? AND deleted_at IS NULL")
        .get(reviewId),
    )
  if (review === undefined) throw new ReviewSuggestionUnavailableError("周回顾不存在")
  const suggestion = z
    .array(reviewSuggestionSchema)
    .parse(JSON.parse(review.suggestions_json))
    .find((entry) => entry.id === suggestionId)
  if (suggestion === undefined) throw new ReviewSuggestionUnavailableError("该建议已不存在")

  const now = new Date().toISOString()
  database.exec("BEGIN IMMEDIATE")
  try {
    const concurrent = findConversion(database, reviewId, suggestionId)
    if (concurrent !== null) {
      database.exec("COMMIT")
      return concurrent
    }
    const entityId = insertConvertedEntity(database, suggestion.type, suggestion.content, now)
    database
      .prepare(
        `INSERT INTO review_suggestion_conversions
         (review_id, suggestion_id, entity_type, entity_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(reviewId, suggestion.id, suggestion.type, entityId, now)
    recordReviewConvertAction(database, reviewId, suggestion.id, suggestion.type, entityId)
    database.exec("COMMIT")
    return reviewSuggestionConversionSchema.parse({
      reviewId,
      suggestionId,
      entityType: suggestion.type,
      entityId,
      createdAt: now,
    })
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

export function listReviewSuggestionConversions(database: DatabaseSync, reviewId: string) {
  return database
    .prepare("SELECT * FROM review_suggestion_conversions WHERE review_id = ?")
    .all(reviewId)
    .map(parseConversion)
}
