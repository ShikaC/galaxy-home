import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  createItem,
  getItemDetail,
  ItemCreateRequestConflictError,
  ItemHasOpenSubtasksError,
  ItemParentConflictError,
  ItemVersionConflictError,
  listItems,
  updateItem,
} from "../../src/server/repositories/items.js"
import {
  advanceProject,
  createProject,
  getProject,
} from "../../src/server/repositories/projects.js"
import { categoryIdSchema } from "../../src/shared/items.js"

let database: DatabaseSync
let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-task-core-items-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { force: true, recursive: true })
})

describe("task core repository", () => {
  it("stores deadline, schedule, estimate, priority, fixed state, reminders, and detail children independently", () => {
    // Given
    const parent = createItem(database, {
      title: "提交方案",
      dueDate: "2026-09-11",
      scheduledStartAt: "2026-09-10T09:00:00+08:00",
      scheduledEndAt: "2026-09-10T10:00:00+08:00",
      scheduleTimezone: "Asia/Shanghai",
      isFixed: true,
      estimatedMinutes: 60,
      priority: "high",
      reminders: [{ anchor: "scheduled", offsetMinutes: 15 }],
    })

    // When
    const child = createItem(database, { title: "检查提纲", parentId: parent.id })
    const detail = getItemDetail(database, parent.id, "2026-09-10")

    // Then
    expect(detail).toMatchObject({
      version: 2,
      dueAt: null,
      dueDate: "2026-09-11",
      scheduledStartAt: "2026-09-10T01:00:00.000Z",
      scheduledEndAt: "2026-09-10T02:00:00.000Z",
      scheduleTimezone: "Asia/Shanghai",
      estimatedMinutes: 60,
      isFixed: true,
      priority: "high",
      subtaskCount: 1,
      completedSubtaskCount: 0,
    })
    expect(
      detail.reminders.map(({ anchor, offsetMinutes }) => ({ anchor, offsetMinutes })),
    ).toEqual([{ anchor: "scheduled", offsetMinutes: 15 }])
    expect(detail.subtasks.map((item) => item.id)).toEqual([child.id])
  })

  it("replays a create request and rejects reuse with different content", () => {
    // Given
    const requestId = crypto.randomUUID()
    const first = createItem(database, { title: "一次创建", requestId })

    // When
    const replay = createItem(database, { title: "一次创建", requestId })

    // Then
    expect(replay.id).toBe(first.id)
    expect(() => createItem(database, { title: "不同内容", requestId })).toThrow(
      ItemCreateRequestConflictError,
    )
    expect(database.prepare("SELECT id FROM items").all()).toHaveLength(1)
  })

  it("rejects stale atomic PATCH before changing scalars or relations", () => {
    // Given
    const item = createItem(database, { title: "原任务" })
    updateItem(database, item.id, { expectedVersion: item.version, title: "已更新" })
    const before = JSON.stringify({
      items: database.prepare("SELECT * FROM items").all(),
      categories: database.prepare("SELECT * FROM item_categories").all(),
    })

    // When
    const stale = () =>
      updateItem(database, item.id, {
        expectedVersion: item.version,
        title: "过期覆盖",
        categoryIds: [],
      })

    // Then
    expect(stale).toThrow(ItemVersionConflictError)
    expect(
      JSON.stringify({
        items: database.prepare("SELECT * FROM items").all(),
        categories: database.prepare("SELECT * FROM item_categories").all(),
      }),
    ).toBe(before)
  })

  it("rolls back scalar changes when an atomic category replacement fails", () => {
    // Given
    const item = createItem(database, { title: "原任务" })
    const missingCategoryId = categoryIdSchema.parse(crypto.randomUUID())

    // When
    const update = () =>
      updateItem(database, item.id, {
        expectedVersion: item.version,
        title: "不能留下",
        categoryIds: [missingCategoryId],
      })

    // Then
    expect(update).toThrow()
    expect(getItemDetail(database, item.id, "2026-09-10")).toMatchObject({
      title: "原任务",
      version: 1,
      categoryIds: [],
    })
  })

  it("enforces one-level parents and requires open children to finish first while allowing recovery", () => {
    // Given
    const parent = createItem(database, { title: "父任务" })
    const child = createItem(database, { title: "子任务", parentId: parent.id })

    // When
    const parentAfterChild = getItemDetail(database, parent.id, "2026-09-10")
    const completeParent = () =>
      updateItem(database, parent.id, {
        expectedVersion: parentAfterChild.version,
        status: "completed",
      })

    // Then
    expect(completeParent).toThrow(ItemHasOpenSubtasksError)
    expect(() => createItem(database, { title: "第三层", parentId: child.id })).toThrow(
      ItemParentConflictError,
    )
    const completedChild = updateItem(database, child.id, {
      expectedVersion: child.version,
      status: "completed",
    })
    const parentAfterChildCompletion = getItemDetail(database, parent.id, "2026-09-10")
    const completedParent = updateItem(database, parent.id, {
      expectedVersion: parentAfterChildCompletion.version,
      status: "completed",
    })
    const recoveredParent = updateItem(database, parent.id, {
      expectedVersion: completedParent.version,
      status: "active",
    })
    expect(completedChild.status).toBe("completed")
    expect(recoveredParent.status).toBe("active")
    expect(getItemDetail(database, child.id, "2026-09-10").status).toBe("completed")
  })

  it("preserves reminder identity on unrelated edits and allows completed child metadata edits", () => {
    // Given
    const parent = createItem(database, {
      title: "父",
      dueAt: "2026-09-11T10:00:00+08:00",
      reminders: [{ anchor: "due", offsetMinutes: 30 }],
    })
    const child = createItem(database, { title: "子", parentId: parent.id })
    const completedChild = updateItem(database, child.id, {
      expectedVersion: child.version,
      status: "completed",
    })
    const parentReady = getItemDetail(database, parent.id, "2026-09-10")
    const completedParent = updateItem(database, parent.id, {
      expectedVersion: parentReady.version,
      status: "completed",
    })
    const reminderId = completedParent.reminders[0]?.id

    // When
    const editedChild = updateItem(database, child.id, {
      expectedVersion: completedChild.version,
      notes: "完成后补充说明",
    })
    const currentParent = getItemDetail(database, parent.id, "2026-09-10")
    const editedParent = updateItem(database, parent.id, {
      expectedVersion: currentParent.version,
      title: "父任务改名",
      reminders: [{ anchor: "due", offsetMinutes: 30 }],
    })

    // Then
    expect(editedChild.notes).toBe("完成后补充说明")
    expect(editedParent.reminders[0]?.id).toBe(reminderId)
  })

  it("keeps completed assigned tasks visible today and includes scheduled overlaps without duplication", () => {
    // Given
    const item = createItem(database, {
      title: "跨日安排",
      scheduledStartAt: "2026-09-09T23:30:00Z",
      scheduledEndAt: "2026-09-10T01:30:00Z",
      scheduleTimezone: "Asia/Shanghai",
      today: { localDate: "2026-09-10", isFocus: false, isSecondary: false },
    })

    // When
    updateItem(database, item.id, { expectedVersion: item.version, status: "completed" })
    const today = listItems(database, {
      view: "today",
      localDate: "2026-09-10",
      timezone: "Asia/Shanghai",
    })

    // Then
    expect(today.map((value) => value.id)).toEqual([item.id])
    expect(today[0]?.status).toBe("completed")
  })

  it("clears the compatibility reminder scalar when an explicit empty rule list is saved", () => {
    // Given
    const item = createItem(database, {
      title: "旧版提醒",
      dueAt: "2026-09-11T10:00:00+08:00",
      reminderMinutes: 30,
    })

    // When
    const updated = updateItem(database, item.id, {
      expectedVersion: item.version,
      reminders: [],
    })

    // Then
    expect(updated.reminderMinutes).toBeNull()
    expect(updated.reminders).toEqual([])
    const createdWithExplicitRules = createItem(database, {
      title: "显式规则优先",
      dueAt: "2026-09-11T10:00:00+08:00",
      reminderMinutes: 30,
      reminders: [],
    })
    expect(createdWithExplicitRules.reminderMinutes).toBeNull()
  })

  it("keeps reminder versions when a full editor resubmits unchanged anchor instants", () => {
    // Given
    const item = createItem(database, {
      title: "不变时刻",
      dueAt: "2026-09-11T10:00:00+08:00",
      scheduledStartAt: "2026-09-10T09:00:00+08:00",
      scheduledEndAt: "2026-09-10T10:00:00+08:00",
      scheduleTimezone: "Asia/Shanghai",
      reminders: [
        { anchor: "due", offsetMinutes: 30 },
        { anchor: "scheduled", offsetMinutes: 10 },
      ],
    })
    const versions = item.reminders.map((rule) => [rule.id, rule.version])

    // When
    const updated = updateItem(database, item.id, {
      expectedVersion: item.version,
      dueAt: "2026-09-11T02:00:00.000Z",
      scheduledStartAt: "2026-09-10T01:00:00.000Z",
      scheduledEndAt: "2026-09-10T02:00:00.000Z",
      scheduleTimezone: "Asia/Shanghai",
      reminders: [
        { anchor: "due", offsetMinutes: 30 },
        { anchor: "scheduled", offsetMinutes: 10 },
      ],
    })

    // Then
    expect(updated.reminders.map((rule) => [rule.id, rule.version])).toEqual(versions)
  })

  it("keeps legacy project advancement atomic when a linked task has open children", () => {
    // Given
    const project = createProject(database, {
      name: "方案项目",
      desiredOutcome: "交付方案",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "执行",
      currentTask: "提交方案",
      nextTask: null,
    })
    const item = createItem(database, { title: "提交方案", projectIds: [project.id] })
    createItem(database, { title: "检查提纲", parentId: item.id })

    // When
    const advance = () =>
      advanceProject(database, project.id, { outcome: null, obstacle: null, nextTask: null })

    // Then
    expect(advance).toThrow(ItemHasOpenSubtasksError)
    expect(getProject(database, project.id).currentTask?.title).toBe("提交方案")
    expect(getItemDetail(database, item.id, "2026-09-10").status).toBe("active")
  })
})
