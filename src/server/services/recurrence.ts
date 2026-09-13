import type { DatabaseSync } from "node:sqlite"
import type { Item } from "../../shared/items.js"
import {
  type CreateTaskSeriesInput,
  type CreateTaskSeriesInputValue,
  createTaskSeriesInputSchema,
  type TaskSeries,
  type UpdateTaskSeriesInput,
  updateTaskSeriesInputSchema,
} from "../../shared/recurrence.js"
import { getItem, updateItem } from "../repositories/items.js"
import { getOccurrenceByItem, setOccurrenceStatus } from "../repositories/taskOccurrences.js"
import {
  existingSeriesRelationIds,
  findTaskSeries,
  getTaskSeries,
  getTaskSeriesCreateRequest,
  insertTaskSeries,
  recordSeriesMaterialization,
  replaceTaskSeries,
} from "../repositories/taskSeries.js"
import { withImmediateTransaction } from "../repositories/transaction.js"
import { materializeTaskSeries } from "./recurrenceMaterializer.js"
import { shiftCalendarDate } from "./time.js"

export class RecurrenceRequestConflictError extends Error {
  readonly name = "RecurrenceRequestConflictError"
  readonly code = "RECURRENCE_REQUEST_CONFLICT"
  readonly statusCode = 409
  constructor(readonly entityId: string) {
    super(`Request id is already bound to another task series payload: ${entityId}`)
  }
}

export class SeriesVersionConflictError extends Error {
  readonly name = "SeriesVersionConflictError"
  readonly code = "SERIES_VERSION_CONFLICT"
  readonly statusCode = 409
  constructor(
    readonly entityId: string,
    readonly currentVersion: number,
  ) {
    super(`Task series version conflict: ${entityId}`)
  }
}

export class OccurrenceRequiredError extends Error {
  readonly name = "OccurrenceRequiredError"
  readonly code = "OCCURRENCE_REQUIRED"
  readonly statusCode = 409
  constructor(readonly itemId: string) {
    super(`Item is not a recurring occurrence: ${itemId}`)
  }
}

export class ItemVersionConflictError extends Error {
  readonly name = "ItemVersionConflictError"
  readonly code = "ITEM_VERSION_CONFLICT"
  readonly statusCode = 409
  constructor(
    readonly entityId: string,
    readonly currentVersion: number,
  ) {
    super(`Item version conflict: ${entityId}`)
  }
}

export class TaskSeriesRelationNotFoundError extends Error {
  readonly name = "TaskSeriesRelationNotFoundError"
  readonly code = "TASK_SERIES_RELATION_NOT_FOUND"
  readonly statusCode = 409
  constructor(readonly entityId: string) {
    super(`Task series references a category or project that does not exist: ${entityId}`)
  }
}

function sameRequest(left: unknown, right: CreateTaskSeriesInput): boolean {
  const parsed = createTaskSeriesInputSchema.safeParse(left)
  return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(right)
}

export function createTaskSeries(
  database: DatabaseSync,
  inputValue: CreateTaskSeriesInputValue,
  localDate: string,
  instant: Date,
): TaskSeries {
  const input = createTaskSeriesInputSchema.parse(inputValue)
  return withImmediateTransaction(database, () => {
    const existing = findTaskSeries(database, input.requestId)
    if (existing !== null) {
      if (!sameRequest(getTaskSeriesCreateRequest(database, existing.id), input)) {
        throw new RecurrenceRequestConflictError(existing.id)
      }
      return existing
    }
    const categories = existingSeriesRelationIds(database, "categories", input.categoryIds)
    const projects = existingSeriesRelationIds(database, "projects", input.projectIds)
    if (
      categories.length !== input.categoryIds.length ||
      projects.length !== input.projectIds.length
    ) {
      throw new TaskSeriesRelationNotFoundError(input.requestId)
    }
    const series = insertTaskSeries(database, input, instant)
    materializeTaskSeries(
      database,
      series.id,
      { fromDate: localDate, toDate: shiftCalendarDate(localDate, 42) },
      instant,
    )
    recordSeriesMaterialization(database, series.id, shiftCalendarDate(localDate, 42), null)
    return getTaskSeries(database, series.id)
  })
}

function mergedSeries(current: TaskSeries, input: UpdateTaskSeriesInput): TaskSeries {
  const candidate = {
    ...current,
    title: input.title ?? current.title,
    notes: input.notes === undefined ? current.notes : input.notes,
    priority: input.priority ?? current.priority,
    categoryIds: input.categoryIds ?? current.categoryIds,
    projectIds: input.projectIds ?? current.projectIds,
    timezone: input.timezone ?? current.timezone,
    rule: input.rule ?? current.rule,
    estimatedMinutes:
      input.estimatedMinutes === undefined ? current.estimatedMinutes : input.estimatedMinutes,
    dueTime: input.dueTime === undefined ? current.dueTime : input.dueTime,
    reminderMinutes:
      input.reminderMinutes !== undefined
        ? input.reminderMinutes
        : input.reminders !== undefined
          ? null
          : current.reminderMinutes,
    reminders:
      input.reminders !== undefined
        ? input.reminders
        : input.reminderMinutes === null
          ? []
          : current.reminders,
    status: input.status ?? current.status,
  }
  createTaskSeriesInputSchema.parse({
    requestId: candidate.id,
    title: candidate.title,
    notes: candidate.notes,
    priority: candidate.priority,
    categoryIds: candidate.categoryIds,
    projectIds: candidate.projectIds,
    timezone: candidate.timezone,
    startDate: candidate.startDate,
    rule: candidate.rule,
    estimatedMinutes: candidate.estimatedMinutes,
    dueTime: candidate.dueTime,
    reminderMinutes: candidate.reminderMinutes,
    reminders: candidate.reminders,
  })
  return candidate
}

export function updateTaskSeries(
  database: DatabaseSync,
  seriesId: string,
  inputValue: UpdateTaskSeriesInput,
  instant: Date,
): TaskSeries {
  const input = updateTaskSeriesInputSchema.parse(inputValue)
  return withImmediateTransaction(database, () => {
    const current = getTaskSeries(database, seriesId)
    if (current.version !== input.expectedVersion) {
      throw new SeriesVersionConflictError(seriesId, current.version)
    }
    const updated = mergedSeries(current, input)
    const categories = existingSeriesRelationIds(database, "categories", updated.categoryIds)
    const projects = existingSeriesRelationIds(database, "projects", updated.projectIds)
    if (
      categories.length !== updated.categoryIds.length ||
      projects.length !== updated.projectIds.length
    ) {
      throw new TaskSeriesRelationNotFoundError(seriesId)
    }
    if (!replaceTaskSeries(database, updated, input.expectedVersion, instant)) {
      throw new SeriesVersionConflictError(seriesId, getTaskSeries(database, seriesId).version)
    }
    return getTaskSeries(database, seriesId)
  })
}

export function skipOccurrence(
  database: DatabaseSync,
  itemId: string,
  expectedVersion: number,
  localDate: string,
  instant: Date,
): Item {
  return withImmediateTransaction(database, () => {
    const item = getItem(database, itemId, localDate)
    if (item.version !== expectedVersion) {
      throw new ItemVersionConflictError(itemId, item.version)
    }
    if (getOccurrenceByItem(database, itemId) === null) throw new OccurrenceRequiredError(itemId)
    updateItem(database, itemId, { expectedVersion, status: "archived" }, localDate, instant)
    setOccurrenceStatus(database, itemId, "skipped", instant)
    return getItem(database, itemId, localDate)
  })
}

export { materializeTaskSeries } from "./recurrenceMaterializer.js"
