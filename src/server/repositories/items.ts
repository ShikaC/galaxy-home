import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { assertNever } from "../../shared/assertNever.js"
import {
  type CreateItemInput,
  createItemInputSchema,
  type Item,
  type ItemDetail,
  type ItemQuery,
  itemIdSchema,
  type ParsedCreateItemInput,
  type UpdateItemInput,
} from "../../shared/items.js"
import { localDateTimeToInstant, shiftCalendarDate } from "../services/time.js"
import {
  assertCanComplete,
  assertExpectedVersion,
  assertMergedTaskState,
  assertParentAllowed,
  bumpReminderRuleVersions,
  createPayloadJson,
  normalizedInstant,
  replaceCategoryRelations,
  replaceProjectRelations,
  replaceReminderRules,
} from "./itemMutations.js"
import { readItem, readItemRows } from "./itemRows.js"
import { ItemCreateRequestConflictError, ItemNotFoundError } from "./taskErrors.js"
import { setTodayItem } from "./todayItems.js"
import { withImmediateTransaction } from "./transaction.js"

export { createCategory, replaceItemCategories } from "./categories.js"
export {
  ItemCreateRequestConflictError,
  ItemHasOpenSubtasksError,
  ItemNotFoundError,
  ItemParentConflictError,
  ItemVersionConflictError,
} from "./taskErrors.js"
export { setTodayItem } from "./todayItems.js"

export function getItem(database: DatabaseSync, itemId: string, localDate: string): Item {
  const row = database
    .prepare("SELECT * FROM items WHERE id = ? AND deleted_at IS NULL")
    .get(itemId)
  if (row === undefined) throw new ItemNotFoundError(itemId)
  return readItem(database, row, localDate)
}

export function getItemDetail(
  database: DatabaseSync,
  itemId: string,
  localDate: string,
): ItemDetail {
  const item = getItem(database, itemId, localDate)
  const subtasks = readItemRows(
    database,
    database
      .prepare(
        "SELECT * FROM items WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at, id",
      )
      .all(item.id),
    localDate,
  )
  return { ...item, subtasks }
}

function replayCreatedItem(
  database: DatabaseSync,
  input: ParsedCreateItemInput,
  localDate: string,
): Item | null {
  if (input.requestId === undefined) return null
  const row = z
    .object({ item_id: z.string().nullable(), payload_json: z.string() })
    .optional()
    .parse(
      database
        .prepare("SELECT item_id, payload_json FROM item_create_requests WHERE request_id = ?")
        .get(input.requestId),
    )
  if (row === undefined) return null
  if (row.payload_json !== createPayloadJson(input) || row.item_id === null)
    throw new ItemCreateRequestConflictError(input.requestId)
  return getItem(database, row.item_id, localDate)
}

export function createItem(
  database: DatabaseSync,
  input: CreateItemInput,
  localDate = new Date().toISOString().slice(0, 10),
  instant = new Date(),
): Item {
  const parsedInput = createItemInputSchema.parse(input)
  return withImmediateTransaction(database, () => {
    const input = parsedInput
    const replay = replayCreatedItem(database, input, localDate)
    if (replay !== null) return replay
    const id = itemIdSchema.parse(crypto.randomUUID())
    const now = instant.toISOString()
    assertParentAllowed(database, id, input.parentId ?? null)
    const reminders =
      input.reminders ??
      (input.reminderMinutes === undefined
        ? []
        : [{ anchor: "due" as const, offsetMinutes: input.reminderMinutes }])
    const reminderMinutes =
      input.reminders === undefined
        ? (input.reminderMinutes ?? null)
        : (input.reminders.find((rule) => rule.anchor === "due")?.offsetMinutes ?? null)
    assertMergedTaskState({
      dueAt: input.dueAt ?? null,
      dueDate: input.dueDate ?? null,
      scheduledStartAt: input.scheduledStartAt ?? null,
      scheduledEndAt: input.scheduledEndAt ?? null,
      scheduleTimezone: input.scheduleTimezone ?? null,
      isFixed: input.isFixed,
      reminders,
    })
    database
      .prepare(
        `INSERT INTO items
       (id,title,notes,due_at,due_date,reminder_minutes,status,priority,parent_id,estimated_minutes,
        scheduled_start_at,scheduled_end_at,schedule_timezone,is_fixed,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.title,
        input.notes ?? null,
        normalizedInstant(input.dueAt),
        input.dueDate ?? null,
        reminderMinutes,
        input.priority,
        input.parentId ?? null,
        input.estimatedMinutes ?? null,
        normalizedInstant(input.scheduledStartAt),
        normalizedInstant(input.scheduledEndAt),
        input.scheduleTimezone ?? null,
        Number(input.isFixed),
        now,
        now,
      )
    replaceCategoryRelations(database, id, input.categoryIds)
    replaceProjectRelations(database, id, input.projectIds)
    replaceReminderRules(database, id, reminders, now)
    if (input.today !== undefined) {
      if (input.today.isSecondary)
        setTodayItem(database, {
          itemId: id,
          localDate: input.today.localDate,
          isFocus: false,
          isSecondary: true,
        })
      else
        setTodayItem(database, {
          itemId: id,
          localDate: input.today.localDate,
          isFocus: input.today.isFocus,
          isSecondary: false,
        })
    }
    database.prepare("UPDATE items SET version = 1 WHERE id = ?").run(id)
    if (input.requestId !== undefined)
      database
        .prepare(
          "INSERT INTO item_create_requests (request_id,item_id,payload_json,created_at) VALUES (?,?,?,?)",
        )
        .run(input.requestId, id, createPayloadJson(input), now)
    return getItem(database, id, localDate)
  })
}

export function copyItem(database: DatabaseSync, itemId: string, localDate: string): Item {
  const item = getItem(database, itemId, localDate)
  return createItem(
    database,
    {
      title: `${item.title} 副本`,
      categoryIds: [...item.categoryIds],
      projectIds: [...item.projectIds],
      priority: item.priority,
      isFixed: item.isFixed,
      reminders: item.reminders.map(({ anchor, offsetMinutes }) => ({ anchor, offsetMinutes })),
      ...(item.notes === null ? {} : { notes: item.notes }),
      ...(item.dueAt === null ? {} : { dueAt: item.dueAt }),
      ...(item.dueDate === null ? {} : { dueDate: item.dueDate }),
      ...(item.estimatedMinutes === null ? {} : { estimatedMinutes: item.estimatedMinutes }),
      ...(item.scheduledStartAt === null ? {} : { scheduledStartAt: item.scheduledStartAt }),
      ...(item.scheduledEndAt === null ? {} : { scheduledEndAt: item.scheduledEndAt }),
      ...(item.scheduleTimezone === null ? {} : { scheduleTimezone: item.scheduleTimezone }),
    },
    localDate,
  )
}

export function listItems(database: DatabaseSync, query: ItemQuery): readonly Item[] {
  if (query.categoryId !== undefined)
    return readItemRows(
      database,
      database
        .prepare(
          `SELECT items.* FROM items JOIN item_categories ON item_categories.item_id=items.id
     WHERE item_categories.category_id=? AND items.status='active' AND items.deleted_at IS NULL
     ORDER BY item_categories.sort_order,items.created_at DESC`,
        )
        .all(query.categoryId),
      query.localDate,
    )
  if (query.projectId !== undefined)
    return readItemRows(
      database,
      database
        .prepare(
          `SELECT items.* FROM items JOIN item_projects ON item_projects.item_id=items.id
     WHERE item_projects.project_id=? AND items.status='active' AND items.deleted_at IS NULL
     ORDER BY items.sort_order,items.created_at DESC`,
        )
        .all(query.projectId),
      query.localDate,
    )
  switch (query.view) {
    case "inbox":
      return readItemRows(
        database,
        database
          .prepare(
            `SELECT items.* FROM items WHERE items.status='active' AND items.deleted_at IS NULL
       AND NOT EXISTS(SELECT 1 FROM item_categories WHERE item_id=items.id)
       AND NOT EXISTS(SELECT 1 FROM item_projects WHERE item_id=items.id) ORDER BY items.created_at DESC`,
          )
          .all(),
        query.localDate,
      )
    case "today": {
      const timezone = query.timezone ?? "UTC"
      const start = localDateTimeToInstant(query.localDate, "00:00", timezone).toISOString()
      const end = localDateTimeToInstant(
        shiftCalendarDate(query.localDate, 1),
        "00:00",
        timezone,
      ).toISOString()
      return readItemRows(
        database,
        database
          .prepare(
            `SELECT DISTINCT items.* FROM items LEFT JOIN today_items ON today_items.item_id=items.id AND today_items.local_date=?
         LEFT JOIN task_occurrences ON task_occurrences.item_id=items.id
         WHERE items.deleted_at IS NULL AND items.status!='archived' AND COALESCE(task_occurrences.status,'active')!='skipped'
         AND (today_items.item_id IS NOT NULL OR (items.scheduled_start_at < ? AND items.scheduled_end_at > ?))
         ORDER BY COALESCE(today_items.is_secondary,0),COALESCE(today_items.sort_order,items.sort_order),items.created_at`,
          )
          .all(query.localDate, end, start),
        query.localDate,
      )
    }
    case "active":
    case "completed":
    case "archived":
      return readItemRows(
        database,
        database
          .prepare(
            "SELECT * FROM items WHERE status=? AND deleted_at IS NULL ORDER BY sort_order,created_at DESC",
          )
          .all(query.view),
        query.localDate,
      )
    default:
      return assertNever(query.view)
  }
}

export function updateItem(
  database: DatabaseSync,
  itemId: string,
  input: UpdateItemInput,
  localDate = new Date().toISOString().slice(0, 10),
  instant = new Date(),
): Item {
  return withImmediateTransaction(database, () => {
    const existing = getItem(database, itemId, localDate)
    assertExpectedVersion(existing, input.expectedVersion)
    const status = input.status ?? existing.status
    const dueAt = input.dueAt === undefined ? existing.dueAt : normalizedInstant(input.dueAt)
    const dueDate = input.dueDate === undefined ? existing.dueDate : input.dueDate
    const scheduledStartAt =
      input.scheduledStartAt === undefined
        ? existing.scheduledStartAt
        : normalizedInstant(input.scheduledStartAt)
    const scheduledEndAt =
      input.scheduledEndAt === undefined
        ? existing.scheduledEndAt
        : normalizedInstant(input.scheduledEndAt)
    const scheduleTimezone =
      input.scheduleTimezone === undefined ? existing.scheduleTimezone : input.scheduleTimezone
    const isFixed = input.isFixed ?? existing.isFixed
    const reminderMinutes =
      input.reminders !== undefined
        ? (input.reminders.find((rule) => rule.anchor === "due")?.offsetMinutes ?? null)
        : input.reminderMinutes === undefined
          ? existing.reminderMinutes
          : input.reminderMinutes
    const existingReminderInputs = existing.reminders.map(({ anchor, offsetMinutes }) => ({
      anchor,
      offsetMinutes,
    }))
    const reminders =
      input.reminders ??
      (input.reminderMinutes === undefined
        ? existingReminderInputs
        : reminderMinutes === null
          ? existingReminderInputs.filter((rule) => rule.anchor !== "due")
          : [
              ...existingReminderInputs.filter((rule) => rule.anchor !== "due"),
              { anchor: "due" as const, offsetMinutes: reminderMinutes },
            ])
    assertMergedTaskState({
      dueAt,
      dueDate,
      scheduledStartAt,
      scheduledEndAt,
      scheduleTimezone,
      isFixed,
      reminders,
    })
    const parentId = input.parentId === undefined ? existing.parentId : input.parentId
    if (input.parentId !== undefined || (input.status === "active" && existing.status !== "active"))
      assertParentAllowed(database, itemId, parentId)
    assertCanComplete(database, itemId, input.status)
    const now = instant.toISOString()
    if (input.categoryIds !== undefined)
      replaceCategoryRelations(database, existing.id, input.categoryIds)
    if (input.projectIds !== undefined)
      replaceProjectRelations(database, existing.id, input.projectIds)
    if (input.reminders !== undefined || input.reminderMinutes !== undefined)
      replaceReminderRules(database, existing.id, reminders, now)
    const convertsTutorial = [
      input.title,
      input.notes,
      input.dueAt,
      input.dueDate,
      input.reminderMinutes,
      input.reminders,
      input.priority,
      input.parentId,
      input.estimatedMinutes,
      input.scheduledStartAt,
      input.scheduledEndAt,
      input.scheduleTimezone,
      input.isFixed,
    ].some((value) => value !== undefined)
    database
      .prepare(
        `UPDATE items SET title=?,notes=?,due_at=?,due_date=?,reminder_minutes=?,status=?,completed_at=?,priority=?,parent_id=?,estimated_minutes=?,
       scheduled_start_at=?,scheduled_end_at=?,schedule_timezone=?,is_fixed=?,is_tutorial=CASE WHEN ?=1 THEN 0 ELSE is_tutorial END,
       updated_at=?,version=? WHERE id=?`,
      )
      .run(
        input.title ?? existing.title,
        input.notes === undefined ? existing.notes : input.notes,
        dueAt,
        dueDate,
        dueAt === null ? null : reminderMinutes,
        status,
        status === "completed" ? (existing.completedAt ?? now) : null,
        input.priority ?? existing.priority,
        parentId,
        input.estimatedMinutes === undefined ? existing.estimatedMinutes : input.estimatedMinutes,
        scheduledStartAt,
        scheduledEndAt,
        scheduleTimezone,
        Number(isFixed),
        Number(convertsTutorial),
        now,
        existing.version + 1,
        itemId,
      )
    const changedAnchors: ("due" | "scheduled")[] = []
    if (input.dueAt !== undefined && dueAt !== existing.dueAt) changedAnchors.push("due")
    if (input.scheduledStartAt !== undefined && scheduledStartAt !== existing.scheduledStartAt)
      changedAnchors.push("scheduled")
    bumpReminderRuleVersions(database, existing.id, changedAnchors, now)
    if (Object.keys(input).some((key) => key !== "expectedVersion" && key !== "status")) {
      database
        .prepare("UPDATE task_occurrences SET is_exception=1,updated_at=? WHERE item_id=?")
        .run(now, itemId)
      database.prepare("UPDATE items SET version=? WHERE id=?").run(existing.version + 1, itemId)
    }
    if (existing.recurrenceStatus === "skipped" && status === "active") {
      database
        .prepare("UPDATE task_occurrences SET status='active',updated_at=? WHERE item_id=?")
        .run(now, itemId)
      database.prepare("UPDATE items SET version=? WHERE id=?").run(existing.version + 1, itemId)
    }
    return getItem(database, itemId, localDate)
  })
}
